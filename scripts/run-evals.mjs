// Runs the scenario set against the real closing selector.
//
//   node scripts/run-evals.mjs                 every bucket B and C scenario
//   node scripts/run-evals.mjs --bucket C      only the clean ones
//   node scripts/run-evals.mjs --only B3,C7    named scenarios
//   node scripts/run-evals.mjs --dry           print the cost and stop
//
// One provider call per scenario. Thirty scenarios is thirty calls, which is
// why it says what it will spend before it spends it.
//
// How a bucket B scenario is scored. The design intent lists up to four cards
// in priority order; the closing shows at most three, because a closing that
// names four things is a report card. So the chain is read as "these are the
// gaps present, most important first" rather than "display all of these", and
// a run passes when:
//
//   precision  every card selected appears in the chain. A card from outside
//              it is a false positive, which is the failure that matters:
//              telling someone they missed something they did not miss.
//   headline   the chain's first card is among those selected. Getting the
//              most important gap is the job.
//   order      the selection is a subsequence of the chain, so the ordering
//              the model chose does not contradict the intended priority.
//
// A bucket C scenario passes when nothing is selected. The bait card being
// selected is called out separately, because that is the specific false
// positive the scenario was written to provoke.

import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] || "");
};
const DRY = args.includes("--dry");
const BUCKET = flag("--bucket");
const ONLY = (flag("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);

const set = JSON.parse(await readFile(new URL("../evals/buckets.json", import.meta.url), "utf8"));
const { validateSelection } = await import("../api/_practices.js");
const { SELECT_SYSTEM } = await import("../api/close.js");
const { callModel, extractJson, textOf } = await import("../api/_model.js");

let scenarios = set.scenarios.filter((s) => s.bucket !== "A");
if (BUCKET) scenarios = scenarios.filter((s) => s.bucket === BUCKET);
if (ONLY.length) scenarios = scenarios.filter((s) => ONLY.includes(s.id));

const key = process.env.MODEL_API_KEY || process.env.OPENROUTER_API_KEY;
const model = process.env.MODEL_ID;

console.log(`${scenarios.length} scenario(s), one provider call each, on ${model || "(MODEL_ID unset)"}.`);
if (DRY) {
  for (const s of scenarios) console.log(`  ${s.id}  ${s.name}`);
  process.exit(0);
}
if (!key || !model) {
  console.error("MODEL_API_KEY and MODEL_ID must be set to run against a provider. Use --dry to list.");
  process.exit(2);
}

// What a person would have typed: the account, then the six answers the
// scenario says each line of questioning would surface. The tool never sees
// the design intent, only what someone said.
function answersFor(s) {
  return [...s.account, ...Object.values(s.pressed)];
}

const isSubsequence = (picked, chain) => {
  let i = 0;
  for (const id of picked) {
    const at = chain.indexOf(id, i);
    if (at === -1) return false;
    i = at + 1;
  }
  return true;
};

const results = [];
for (const s of scenarios) {
  const answers = answersFor(s);
  let picked = [], note = "";
  try {
    const response = await callModel(key, model, SELECT_SYSTEM, [
      { role: "user", content: answers.map((a, i) => `[${i + 1}] ${a}`).join("\n\n") }
    ]);
    const parsed = extractJson(textOf(response));
    if (!parsed || !Array.isArray(parsed.selected)) {
      note = "unparseable reply";
    } else {
      const { kept, rejected } = validateSelection(parsed, answers);
      picked = kept.map((k) => k.id);
      // A rejected quote is worth seeing: it means the model paraphrased,
      // which the server caught, but which would have been a fabrication.
      if (rejected.length) note = rejected.map((r) => `${r.id}: ${r.why}`).join("; ");
    }
  } catch (error) {
    note = `call failed: ${error?.message || error}`.slice(0, 120);
  }

  const r = { id: s.id, bucket: s.bucket, name: s.name, picked, note };
  if (s.bucket === "B") {
    const chain = s.expectCards;
    r.outside = picked.filter((id) => !chain.includes(id));
    r.headline = picked.includes(chain[0]);
    r.ordered = isSubsequence(picked, chain);
    r.pass = picked.length > 0 && r.outside.length === 0 && r.headline && r.ordered;
    r.want = chain;
  } else {
    r.baited = picked.includes(s.mustNotSelect);
    r.pass = picked.length === 0;
    r.want = [];
    r.bait = s.mustNotSelect;
  }
  results.push(r);

  const mark = r.pass ? "PASS" : "FAIL";
  const detail = s.bucket === "B"
    ? `got [${picked}] want-from [${r.want}]${r.outside?.length ? ` OUTSIDE:[${r.outside}]` : ""}${r.headline ? "" : " MISSED-HEADLINE"}${r.ordered ? "" : " OUT-OF-ORDER"}`
    : `got [${picked}]${r.baited ? ` BAITED:${r.bait}` : ""}`;
  console.log(`${mark}  ${s.id.padEnd(4)} ${s.name.slice(0, 34).padEnd(34)} ${detail}${note ? `  (${note})` : ""}`);
}

const b = results.filter((r) => r.bucket === "B");
const c = results.filter((r) => r.bucket === "C");
const pct = (list) => list.length ? Math.round(100 * list.filter((r) => r.pass).length / list.length) : 0;

console.log("");
if (b.length) {
  console.log(`gap scenarios   ${b.filter((r) => r.pass).length}/${b.length} (${pct(b)}%)`);
  const fp = b.filter((r) => r.outside.length);
  if (fp.length) console.log(`  named a card the account does not support: ${fp.map((r) => r.id).join(", ")}`);
  const miss = b.filter((r) => !r.headline);
  if (miss.length) console.log(`  missed the headline gap: ${miss.map((r) => r.id).join(", ")}`);
}
if (c.length) {
  console.log(`clean scenarios ${c.filter((r) => r.pass).length}/${c.length} (${pct(c)}%)`);
  const baited = c.filter((r) => r.baited);
  if (baited.length) console.log(`  took the bait: ${baited.map((r) => `${r.id}/${r.bait}`).join(", ")}`);
  const other = c.filter((r) => !r.pass && !r.baited);
  if (other.length) console.log(`  found a gap in clean work: ${other.map((r) => `${r.id}[${r.picked}]`).join(", ")}`);
}
console.log("");
console.log("A clean-scenario failure is worse than a gap-scenario failure: naming");
console.log("something a careful practitioner did not miss is the one error that");
console.log("costs the tool its credibility with the people it is written for.");

process.exit(results.every((r) => r.pass) ? 0 : 1);
