// Replay a recorded conversation's answers against the questioner, and print
// the new question beside the one the person actually got.
//
//   node scripts/replay.mjs --base http://127.0.0.1:3000
//   node scripts/replay.mjs --base http://127.0.0.1:3000 --only restaurant
//   node scripts/replay.mjs --base https://... --pin 130115
//   node scripts/replay.mjs --dry            print what it would send, spend nothing
//
// Why this exists. Every other instrument in here either fakes the provider
// (the simulations) or feeds the model scenarios written for it (the eval
// set). Neither can answer the question that actually came up: the owner
// said the questions read in a circular loop and kept pushing him to answer
// that he had not had enough information. The only evidence that settles
// that is his own words going in and the new questions coming out.
//
// What a replay proves, and what it does not. The answers were given to the
// OLD questions. Turn one is a fair comparison, because the opening account
// is the same text either way. From turn two on, the answer being fed is a
// reply to a question that was never asked, so the conversation will drift -
// and that is fine for what this measures. It measures how the questions
// READ and whether they presuppose, both of which are properties of the
// question text. It measures nothing about how a real conversation goes.
// For that, a person has to type.

import { readFileSync } from "node:fs";
import { violations, wordCount } from "./_rules.mjs";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = (arg("base") || "").replace(/\/$/, "");
const PIN = arg("pin");
const ONLY = (arg("only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const DRY = process.argv.includes("--dry");

const set = JSON.parse(readFileSync(new URL("../evals/replays.json", import.meta.url), "utf8"));
let conversations = set.conversations;
if (ONLY.length) conversations = conversations.filter((c) => ONLY.includes(c.id));
if (!conversations.length) { console.error("no matching conversation"); process.exit(2); }

const turns = conversations.reduce((n, c) => n + Math.min(c.answers.length, 5), 0);
console.log(`${conversations.length} conversation(s), up to ${turns} provider call(s).`);
if (DRY) {
  for (const c of conversations) {
    console.log(`\n${c.id}  ${c.name}  (${c.answers.length} answers, ${c.questions.length} questions recorded)`);
    c.answers.forEach((a, i) => console.log(`  [${i + 1}] ${a.slice(0, 70)}${a.length > 70 ? "…" : ""}`));
  }
  process.exit(0);
}
if (!BASE) { console.error("--base is required, or use --dry"); process.exit(2); }

const post = async (path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-access-token": token } : {}) },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, json: null, text }; }
};

async function unlock() {
  if (!PIN) return null;
  const { json } = await post("/api/unlock", { pin: PIN });
  if (json?.open === true || json?.gate === "open") return null;
  if (!json?.token) { console.error(`unlock failed: ${JSON.stringify(json)}`); process.exit(1); }
  return json.token;
}

const wrap = (text, indent) => {
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if ((line + " " + word).trim().length > 74 - indent.length) { out.push(line); line = word; }
    else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out.map((l, i) => (i ? indent : "") + l).join("\n");
};

let flagged = 0, asked = 0, closedEarly = [];

for (const c of conversations) {
  console.log(`\n${"=".repeat(74)}\n${c.id}  ${c.name}\n${"=".repeat(74)}`);
  if (c.note) console.log(wrap(c.note, "  ") + "\n");

  const token = await unlock();
  const answers = [], questions = [];
  let reflection = null, status = null;

  for (let turn = 0; turn < c.answers.length; turn++) {
    answers.push(c.answers[turn]);
    const { json } = await post("/api/ask", { answers, questions }, token);
    if (!json) { console.log(`  turn ${turn + 1}: no JSON back`); break; }
    if (!json.ok) { console.log(`  turn ${turn + 1}: FELL BACK reason=${json.reason}`); break; }

    status = json.status;
    if (json.reflection) reflection = json.reflection;

    console.log(`  --- turn ${turn + 1} ---`);
    console.log(`  they said:  ${wrap(c.answers[turn], "              ")}`);
    if (c.questions[turn]) {
      console.log(`  was (${String(wordCount(c.questions[turn])).padStart(2)}w): ${wrap(c.questions[turn], "            ")}`);
    }
    const q = json.question || "(none)";
    console.log(`  now (${String(wordCount(q)).padStart(2)}w): ${wrap(q, "            ")}`);
    console.log(`  status:     ${status}`);

    // The same rules the tests pin, against the answers the model could see.
    const bad = violations(q, [], { answers: [...answers], seen: questions });
    asked += 1;
    if (bad.length) { flagged += 1; for (const b of bad) console.log(`  BREAKS:     ${b}`); }

    questions.push(q);
    if (status === "reached" || status === "verified") {
      closedEarly.push(`${c.id} on turn ${turn + 1} (${status})`);
      break;
    }
  }

  console.log(`\n  ended: ${status}`);
  console.log(`  reflection: ${reflection ? wrap(reflection, "              ") : "NONE"}`);
  if (!reflection) {
    console.log("  ^ the thing the owner said was missing. Still missing unless the");
    console.log("    status closed, which is the bug the ledger is meant to fix.");
  }
}

console.log(`\n${"=".repeat(74)}`);
console.log(`${asked} question(s) asked, ${flagged} breaking a rule.`);
if (closedEarly.length) console.log(`closed before the turn cap: ${closedEarly.join(", ")}`);
console.log("");
console.log("Turn one is the honest comparison: same opening account, both prompts.");
console.log("Later turns feed an answer that replied to a question never asked, so");
console.log("read them for how the question is WORDED, not for whether it followed.");
process.exit(flagged ? 1 : 0);
