// Walk a whole conversation against the deployed site, the way a visitor
// does, and report what came back.
//
//   node scripts/walk-live.mjs --base https://... --pin 130115 --scenario B17
//   node scripts/walk-live.mjs --base https://... --pin 130115 --say "I used AI to..."
//   node scripts/walk-live.mjs ... --scenario B17,B16,C4 --turns 4
//   node scripts/walk-live.mjs --base http://127.0.0.1:3000 --stub
//
// --stub walks the same path against the built-in stub, which spends no
// provider call. It proves this script's own plumbing rather than the
// model's behaviour, which is the right thing to check before spending
// anything.
//
// Why this exists: the simulations run against a fake provider, so they
// prove the handlers behave and prove nothing about what the model says.
// The eval runner calls the provider directly, so it skips the gate, the
// rate limiter, the token exchange and the deployed bundle. Neither one
// answers "does the live page actually work", which is the only question
// that was ever in doubt.
//
// It spends real model calls - roughly $0.02 a conversation on Sonnet 5 -
// so it names the cost before it starts and counts the calls as it goes.
//
// Each question is run through the same form rules the eval set uses, so a
// question that asks two things, or one answerable yes or no, is reported
// here rather than noticed by eye three runs later.

import { readFileSync } from "node:fs";
import { violations } from "./_rules.mjs";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = (arg("base") || "").replace(/\/$/, "");
const PIN = arg("pin");
const TURNS = Number(arg("turns", 4));
const STUB = process.argv.includes("--stub") ? "?stub=1" : "";
if (!BASE) {
  console.error("--base https://your-deployment is required");
  process.exit(2);
}

const post = async (path, body, token) => {
  const res = await fetch(`${BASE}${path}${path === "/api/unlock" ? "" : STUB}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-access-token": token } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* reported below */ }
  return { status: res.status, json, text, fallback: res.headers.get("x-fallback-reason") };
};

// The gate, if there is one. A deployment with no pins configured says so
// rather than issuing a token that means nothing, and that is not an error.
async function unlock() {
  if (!PIN) return null;
  const { status, json } = await post("/api/unlock", { pin: PIN });
  if (json?.open === true || json?.gate === "open") return null;
  if (!json?.token) {
    console.error(`unlock failed: ${status} ${JSON.stringify(json)}`);
    process.exit(1);
  }
  return json.token;
}

// What a person types next. Scripted, because the point is to see the
// questions, not to improvise answers - and a scripted reply is the same on
// every run, so two runs are comparable.
function replies(scenario) {
  if (scenario?.pressed) return Object.values(scenario.pressed);
  return [
    "I read it through and it looked right to me.",
    "Nothing outside the tool itself.",
    "Nobody else saw it before it went out."
  ];
}

function scenariosFrom(ids) {
  const set = JSON.parse(readFileSync("evals/buckets.json", "utf8"));
  return ids.split(",").map((id) => {
    const found = set.scenarios.find((s) => s.id === id.trim());
    if (!found) { console.error(`no scenario ${id}`); process.exit(2); }
    return found;
  });
}

const openings = arg("scenario")
  ? scenariosFrom(arg("scenario"))
  : [{ id: "ad-hoc", name: "typed in", account: [arg("say") || "I used AI to draft a recommendation that went to my manager, and I did not check what it was working from."] }];

let calls = 0;
const faults = [];

for (const scenario of openings) {
  console.log(`\n${"=".repeat(74)}\n${scenario.id}  ${scenario.name}\n${"=".repeat(74)}`);
  const token = await unlock();
  const answers = [scenario.account.join(" ").trim()];
  const questions = [];
  const scripted = replies(scenario);
  let last = null;

  for (let turn = 0; turn < TURNS; turn++) {
    last = (await post("/api/ask", { answers, questions }, token)).json;
    calls++;
    if (!last) { faults.push(`${scenario.id}: no JSON back from /api/ask`); break; }
    if (!last.ok) {
      // The one thing the page promises is that this is a closing screen and
      // not an error. Worth seeing the reason all the same.
      console.log(`  turn ${turn + 1}: FELL BACK  reason=${last.reason}  build=${last.build}`);
      faults.push(`${scenario.id} turn ${turn + 1}: ${last.reason}`);
      break;
    }
    const bad = violations(last.question);
    console.log(`  turn ${turn + 1} [${last.status}] ${last.question}`);
    if (last.reflection) console.log(`           reflection: ${last.reflection}`);
    if (last.closing_note) console.log(`           note: ${last.closing_note}`);
    for (const b of bad) {
      console.log(`           FORM: ${b}`);
      faults.push(`${scenario.id} turn ${turn + 1}: ${b}`);
    }
    if (last.status !== "probing") break;
    questions.push(last.question);
    answers.push(scripted[turn % scripted.length]);
  }

  // The closing selector is a separate call and a separate failure, so it is
  // walked even when the question phase fell back.
  const closed = (await post("/api/close", { answers }, token)).json;
  calls++;
  if (!closed?.ok) {
    console.log(`  closing: general (reason=${closed?.reason})`);
  } else {
    const names = closed.selected.map((s) => s.id);
    console.log(`  closing: ${names.join(", ") || "(no cards, which is a legitimate answer)"}`);
    if (closed.rejected?.length) {
      for (const r of closed.rejected) console.log(`           rejected ${r.id}: ${r.why}`);
    }
    if (scenario.expectCards) {
      const missed = scenario.expectCards.filter((c) => !names.includes(c));
      const unexpected = names.filter((c) => !scenario.expectCards.includes(c));
      console.log(`           expected ${scenario.expectCards.join(", ")}`);
      if (missed.length) faults.push(`${scenario.id}: closing missed ${missed.join(", ")}`);
      if (unexpected.length) faults.push(`${scenario.id}: closing added ${unexpected.join(", ")}`);
    }
    if (scenario.mustNotSelect && names.includes(scenario.mustNotSelect)) {
      faults.push(`${scenario.id}: selected the bait card ${scenario.mustNotSelect}`);
    }
  }
}

console.log(STUB
  ? `\n${calls} stubbed request(s), nothing spent`
  : `\n${calls} provider-backed request(s), about $${(calls * 0.003).toFixed(3)} at sonnet-5 list`);
if (faults.length) {
  console.log(`\n${faults.length} thing(s) to look at:`);
  for (const f of faults) console.log(`  - ${f}`);
} else {
  console.log("\nnothing to look at: every question was well formed and every closing landed");
}
