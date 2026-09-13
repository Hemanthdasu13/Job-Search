// Does the model choice change what the tool asks? Measure it rather than
// argue about it.
//
//   OPENROUTER_API_KEY=... node scripts/compare-models.mjs \
//     anthropic/claude-sonnet-5 nvidia/nemotron-3.5-lightning:free
//
// Runs identical, scripted conversations through each model using the exact
// system prompt the deployed tool uses, then prints the questions side by
// side with the rules each model broke. It talks to the provider directly,
// so it needs no deployment and does not touch the live site's budget.
//
// Read the questions. The counts tell you which model obeys; only you can
// tell which model asks the better question.

import { SYSTEM } from "../api/ask.js";
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


const KEY = process.env.OPENROUTER_API_KEY;
const BASE = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api")
  .replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "");
const MODELS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 1;

if (!KEY || MODELS.length < 1) {
  console.error("usage: OPENROUTER_API_KEY=... node scripts/compare-models.mjs <model> [<model>...] [--runs N]");
  process.exit(2);
}

// Fixed inputs from the shared scenario file. Every model sees exactly the
// same words, so any difference in the questions is the model, not the
// conversation.
const SCENARIOS = loadScenarios(
  process.argv.includes("--scenarios") ? process.argv[process.argv.indexOf("--scenarios") + 1] : null
);

async function call(model, messages) {
  const started = Date.now();
  const res = await fetch(`${BASE}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM, messages })
  });
  const body = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status}: ${body.slice(0, 160)}`, ms: Date.now() - started };
  let parsed = null;
  try {
    const json = JSON.parse(body);
    const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    parsed = JSON.parse(start !== -1 ? text.slice(start, end + 1) : text);
  } catch {
    return { error: "reply was not usable JSON", ms: Date.now() - started };
  }
  return { ...parsed, ms: Date.now() - started };
}

const tally = {};

for (const model of MODELS) {
  tally[model] = { broken: 0, questions: 0, unusable: 0, ms: [] };
  console.log(`\n${"=".repeat(72)}\n${model}\n${"=".repeat(72)}`);

  for (const scenario of SCENARIOS) {
    console.log(`\n  ${scenario.name}`);
    for (let run = 0; run < RUNS; run++) {
      const messages = [], seen = [];
      for (const turn of scenario.turns) {
        messages.push({ role: "user", content: turn });
        const r = await call(model, messages);
        tally[model].ms.push(r.ms);

        if (r.error) {
          tally[model].unusable += 1;
          console.log(`    ! ${r.error}`);
          break;
        }
        tally[model].questions += 1;
        const bad = violations(r.question || "", scenario.secrets || [], seen);
        if (r.reflection && !["reached", "verified"].includes(r.status)) {
          bad.push(`reflection returned on status "${r.status}"`);
        }
        tally[model].broken += bad.length;

        console.log(`    [${r.status}] ${r.question}`);
        if (r.reflection) console.log(`      reflection: ${r.reflection}`);
        for (const b of bad) console.log(`      BREAKS: ${b}`);

        seen.push(r.question);
        messages.push({ role: "assistant", content: r.question });
        if (r.status === "reached" || r.status === "verified") break;
      }
    }
  }
}

console.log(`\n${"=".repeat(72)}\nsummary\n${"=".repeat(72)}`);
for (const [model, t] of Object.entries(tally)) {
  t.ms.sort((a, b) => a - b);
  const median = t.ms[Math.floor(t.ms.length / 2)] || 0;
  console.log(
    `${model}\n  ${t.questions} questions, ${t.broken} rule breaks, ` +
    `${t.unusable} unusable replies, median ${median}ms`
  );
}
console.log(
  "\nRule breaks measure obedience, not quality. Read the questions above and\n" +
  "judge which model actually found the thing that mattered."
);
