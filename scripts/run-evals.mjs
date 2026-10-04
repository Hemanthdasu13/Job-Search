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
//
// Bucket T is the targeted set: one scenario per card, each account written so
// that exactly one card is right and everything else a careful reader could
// reach for is closed off in the text. It answers a different question from
// bucket B. B asks whether the chain of gaps in a messy account comes out in
// the right order; T asks whether a single named gap gets picked up at all, or
// whether the logic drifts to the gap it is used to finding. So a T run
// reports three outcomes rather than two:
//
//   picked it     the target is among the cards selected
//   drifted       something was selected and the target was not. The card it
//                 drifted to is the finding: a drift that lands on the same
//                 one every time is a bias, not a miss.
//   saw nothing   nothing was selected, so the gap is invisible to the logic
//
// A T scenario passes when the target is selected and no declared confusable
// is. 'nearMiss' names a card that genuinely co-occurs with the target, where
// a pick is worth seeing and is not held against the run.
//
// T is not in the default run: it is seventeen more calls, and B and C are
// the suite that guards against shipping a false positive.

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

let scenarios = set.scenarios.filter((s) => s.bucket !== "A" && s.bucket !== "T");
if (BUCKET) scenarios = set.scenarios.filter((s) => s.bucket === BUCKET);
if (ONLY.length) scenarios = set.scenarios.filter((s) => ONLY.includes(s.id));

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
  } else if (s.bucket === "T") {
    const confusable = s.confusable || [];
    const near = s.nearMiss || [];
    r.target = s.target;
    r.hit = picked.includes(s.target);
    r.headline = picked[0] === s.target;
    r.confused = picked.filter((id) => confusable.includes(id));
    r.near = picked.filter((id) => near.includes(id));
    r.drift = r.hit ? [] : picked;
    r.want = [s.target];
    r.pass = r.hit && r.confused.length === 0;
  } else {
    r.baited = picked.includes(s.mustNotSelect);
    r.pass = picked.length === 0;
    r.want = [];
    r.bait = s.mustNotSelect;
  }
  results.push(r);

  const mark = r.pass ? "PASS" : "FAIL";
  let detail;
  if (s.bucket === "B") {
    detail = `got [${picked}] want-from [${r.want}]${r.outside?.length ? ` OUTSIDE:[${r.outside}]` : ""}${r.headline ? "" : " MISSED-HEADLINE"}${r.ordered ? "" : " OUT-OF-ORDER"}`;
  } else if (s.bucket === "T") {
    const verdict = r.hit ? (r.headline ? "picked it, first" : "picked it") : (picked.length ? `DRIFTED to ${r.drift.join(",")}` : "SAW NOTHING");
    detail = `${s.target} -> ${verdict}${r.confused?.length ? ` CONFUSED:[${r.confused}]` : ""}${r.near?.length ? ` near:[${r.near}]` : ""}`;
  } else {
    detail = `got [${picked}]${r.baited ? ` BAITED:${r.bait}` : ""}`;
  }
  console.log(`${mark}  ${s.id.padEnd(4)} ${s.name.slice(0, 34).padEnd(34)} ${detail}${note ? `  (${note})` : ""}`);
}

const b = results.filter((r) => r.bucket === "B");
const c = results.filter((r) => r.bucket === "C");
const t = results.filter((r) => r.bucket === "T");
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
if (t.length) {
  console.log(`targeted gaps  ${t.filter((r) => r.pass).length}/${t.length} (${pct(t)}%)`);
  const first = t.filter((r) => r.headline).length;
  console.log(`  picked up and led with the target: ${first}/${t.length}`);
  const blind = t.filter((r) => !r.hit && !r.drift.length);
  if (blind.length) console.log(`  gap invisible, nothing selected: ${blind.map((r) => r.target).join(", ")}`);
  const drifted = t.filter((r) => !r.hit && r.drift.length);
  if (drifted.length) {
    console.log(`  gap missed, a different one named instead:`);
    for (const r of drifted) console.log(`    ${r.target} -> ${r.drift.join(", ")}`);
  }
  // Where the drift lands is the whole point of this bucket. One card
  // collecting the misses is a bias in the logic; misses scattered across
  // many cards is noise.
  const pull = new Map();
  for (const r of drifted) for (const id of r.drift) pull.set(id, (pull.get(id) || 0) + 1);
  if (pull.size) {
    console.log(`  cards the logic reaches for when it misses:`);
    for (const [id, n] of [...pull].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(2)}  ${id}`);
  }
  const confused = t.filter((r) => r.confused.length);
  if (confused.length) console.log(`  named a card the account closes off: ${confused.map((r) => `${r.id}[${r.confused}]`).join(", ")}`);
  const near = t.filter((r) => r.near.length);
  if (near.length) console.log(`  also named a card that genuinely co-occurs: ${near.map((r) => `${r.id}[${r.near}]`).join(", ")}`);
}
console.log("");
console.log("A clean-scenario failure is worse than a gap-scenario failure: naming");
console.log("something a careful practitioner did not miss is the one error that");
console.log("costs the tool its credibility with the people it is written for.");

process.exit(results.every((r) => r.pass) ? 0 : 1);
