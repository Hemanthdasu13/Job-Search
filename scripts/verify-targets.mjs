// Checks bucket T before it costs anything to run.
//
// Bucket T is one scenario per card. Each account is written so that exactly
// one card is right: everything else a careful reader could reach for is
// positively closed off in the text. 'confusable' names the cards the
// scenario was written to NOT support, and selecting one of them is the
// failure that matters - it means the logic found the gap it is used to
// finding rather than the one in front of it. 'nearMiss' names a card that
// genuinely co-occurs, where a pick is worth seeing but is not a false
// positive.
//
// This script asserts the shape of the set. It cannot assert that an account
// really closes a card off - only reading it can do that - so it also prints
// how often each card is declared confusable, which is where the set's own
// blind spots would show.

import { readFile } from "node:fs/promises";

const set = JSON.parse(await readFile(new URL("../evals/buckets.json", import.meta.url), "utf8"));
const { PRACTICE_IDS, isPracticeId } = await import("../api/_practices.js");

const T = set.scenarios.filter((s) => s.bucket === "T");
const fail = [];
const bad = (id, why) => fail.push(`${id}: ${why}`);

// One scenario per card, no card twice, no card missed.
const byTarget = new Map();
for (const s of T) {
  if (!isPracticeId(s.target)) { bad(s.id, `target '${s.target}' is not a card`); continue; }
  if (byTarget.has(s.target)) bad(s.id, `target ${s.target} is already T${byTarget.get(s.target).id}'s`);
  byTarget.set(s.target, s);
}
for (const id of PRACTICE_IDS) if (!byTarget.has(id)) fail.push(`no targeted scenario for ${id}`);

for (const s of T) {
  const text = [s.name, ...s.account, ...Object.values(s.pressed || {})].join("\n");

  if (!Array.isArray(s.account) || !s.account.length) bad(s.id, "no account");
  const answers = Object.values(s.pressed || {});
  if (answers.length !== 6) bad(s.id, `${answers.length} pressed answers, want 6`);
  if (answers.some((a) => typeof a !== "string" || a.trim().length < 20)) bad(s.id, "a pressed answer is too thin to be an answer");

  if (!Array.isArray(s.confusable) || s.confusable.length < 3) bad(s.id, "needs at least three declared confusables");
  for (const c of s.confusable || []) {
    if (!isPracticeId(c)) bad(s.id, `confusable '${c}' is not a card`);
    if (c === s.target) bad(s.id, "target is listed as its own confusable");
  }
  for (const n of s.nearMiss || []) {
    if (!isPracticeId(n)) bad(s.id, `nearMiss '${n}' is not a card`);
    if (n === s.target) bad(s.id, "target is listed as its own near miss");
    if ((s.confusable || []).includes(n)) bad(s.id, `${n} is both confusable and near miss`);
  }

  // expectCards keeps the field every other bucket has, so anything reading
  // the set generically still sees the one card this scenario is about.
  if (JSON.stringify(s.expectCards) !== JSON.stringify([s.target])) bad(s.id, "expectCards must be exactly the target");

  // The account must not hand over the answer. A card id in the prose would
  // be testing whether the model can read, not whether it can judge.
  for (const id of PRACTICE_IDS) if (text.includes(id)) bad(s.id, `leaks the card id ${id}`);

  if (!s.note || s.note.length < 40) bad(s.id, "no note saying what the scenario closed off");
}

const asConfusable = new Map(PRACTICE_IDS.map((id) => [id, 0]));
for (const s of T) for (const c of s.confusable || []) asConfusable.set(c, asConfusable.get(c) + 1);

console.log(`bucket T: ${T.length} scenario(s), ${byTarget.size}/${PRACTICE_IDS.length} cards targeted`);
console.log("");
console.log("declared confusable (the cards the set expects a drift towards):");
for (const [id, n] of [...asConfusable].sort((a, b) => b[1] - a[1])) {
  if (n) console.log(`  ${String(n).padStart(2)}  ${id}`);
}
const never = PRACTICE_IDS.filter((id) => !asConfusable.get(id));
if (never.length) console.log(`  never declared confusable: ${never.join(", ")}`);

console.log("");
if (fail.length) {
  for (const f of fail) console.log(`FAIL  ${f}`);
  process.exit(1);
}
console.log("Shape is sound. Whether each account really closes its confusables off");
console.log("is a reading job, not a check: evals/buckets.json carries the note.");
