// Reliability probe for a deployed instance.
//
//   node scripts/probe-live.mjs https://your-site.vercel.app
//   node scripts/probe-live.mjs https://your-site.vercel.app --delay 4000
//
// Drives real conversations against /api/ask and checks the rules the brief
// actually specifies, rather than checking that something came back. No
// dependencies: plain node, any machine with network access.
//
// It cannot judge whether a question is a *good* question for your work.
// That part is irreducibly yours. It can tell you whether the model is
// obeying its constraints, which is where small models fail and where a
// failure would embarrass you on a page that promises it never asserts.

const BASE = (process.argv[2] || "").replace(/\/+$/, "");
const DELAY = Number((process.argv[process.argv.indexOf("--delay") + 1]) || 1500);
if (!BASE.startsWith("http")) {
  console.error("usage: node scripts/probe-live.mjs https://your-site.vercel.app [--delay ms]");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { violations } from "./_rules.mjs";
import { readFileSync } from "node:fs";

function loadScenarios(file) {
  const path = file || new URL("../evals/scenarios.json", import.meta.url).pathname;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed.scenarios.map((s) => ({
    ...s,
    forbid: s.forbid ? new RegExp(s.forbid, "i") : null
  }));
}


async function ask(answers, questions) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ answers, questions })
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { http: res.status, ms: Date.now() - started, data, raw: text.slice(0, 200) };
}

const SCENARIOS = loadScenarios(
  process.argv.includes("--scenarios") ? process.argv[process.argv.indexOf("--scenarios") + 1] : null
).map((s) => ({ ...s, replies: s.turns }));

console.log(`probing ${BASE}\n`);
let failed = 0, ratelimited = false;
const latencies = [];

for (const scenario of SCENARIOS) {
  const answers = [], questions = [], seen = [], problems = [];
  let status = null, note = null, reflection = null;

  for (const reply of scenario.replies) {
    answers.push(reply);
    const r = await ask(answers, questions);
    latencies.push(r.ms);

    if (r.http !== 200 || !r.data) { problems.push(`HTTP ${r.http}: ${r.raw}`); break; }
    if (r.data.ok !== true) {
      if (r.data.reason === "ip_rate_limit" || r.data.reason === "daily_cap") { ratelimited = true; }
      problems.push(`call failed: ${r.data.reason || "no reason given"}`);
      break;
    }

    status = r.data.status;
    reflection = r.data.reflection;
    note = r.data.closing_note || note;

    problems.push(...violations(r.data.question, scenario.secrets || [], seen).map((v) => `question: ${v}`));
    if (scenario.forbid && scenario.forbid.test(r.data.question)) {
      problems.push(`question: flags the contradiction: "${r.data.question.match(scenario.forbid)[0]}"`);
    }
    for (const secret of scenario.secrets || []) {
      if (reflection && reflection.toLowerCase().includes(secret.toLowerCase())) {
        problems.push(`reflection: repeats confidential detail: "${secret}"`);
      }
    }
    if (reflection && !["reached", "verified"].includes(status)) {
      problems.push(`reflection returned on status "${status}", should be null`);
    }

    seen.push(r.data.question);
    questions.push(r.data.question);
    if (status === "reached" || status === "verified") break;
    await sleep(DELAY);
  }

  if (status && !scenario.expect.includes(status)) {
    problems.push(`ended on "${status}", expected one of ${scenario.expect.join(" / ")}`);
  }
  if (scenario.wantNote && !note) problems.push("no closing_note for a real outcome that already happened");
  if (["reached", "verified"].includes(status) && !reflection) {
    problems.push(`status "${status}" with no reflection to show back`);
  }

  if (problems.length) { failed++; }
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${scenario.name}`);
  for (const p of problems) console.log(`        - ${p}`);
  if (!problems.length && seen.length) console.log(`        last question: ${seen[seen.length - 1]}`);
  await sleep(DELAY);
}

latencies.sort((a, b) => a - b);
const median = latencies[Math.floor(latencies.length / 2)] || 0;
console.log(`\n${SCENARIOS.length - failed}/${SCENARIOS.length} scenarios clean`);
console.log(`latency: median ${median}ms, slowest ${latencies[latencies.length - 1] || 0}ms`);
if (median > 6000) console.log("  slow enough that visitors will feel it; consider a faster model");
if (ratelimited) console.log("\nSome calls hit the rate limit, so those results are not real failures.\nRe-run with --delay 60000, or raise RATE_LIMIT_PER_IP while testing.");
console.log("\nThis checks the model's constraints, not whether its questions are good.\nRead the questions above: only you can judge if they found the right thing.");
process.exit(failed ? 1 : 0);
