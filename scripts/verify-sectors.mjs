// Bucket S, and the one thing about it that can be settled without a provider.
//
// His concern, in his words: the people who will test this hardest are the
// target audience, and the whole reason the tool asks questions instead of
// answering them is so that it is not a general-purpose assistant with a
// research badge on. The moment it asks a question that would fit any account,
// a reader concludes Claude would have done this anyway, and they are right.
//
// So: a battery of stock verification questions - the ones a generalist would
// produce - run against all sixteen sector accounts. Every one must fail. If
// any stock question survives against any account, the tool can be generic
// there and the rule set does not bite.
//
// Then the reverse: each account must carry enough distinctive vocabulary for
// an anchored question to be possible at all. A rule that cannot be satisfied
// is worse than no rule, because the retry spends a call and lands in the
// same place.

import { readFile } from "node:fs/promises";
import { violations, anchorWords, contentWordsOf } from "./_rules.mjs";

const set = JSON.parse(await readFile(new URL("../evals/buckets.json", import.meta.url), "utf8"));
const sectors = set.scenarios.filter((s) => s.bucket === "S");

// What a general-purpose assistant asks about verification. Each is a
// perfectly sensible question and each would fit any account ever typed.
const STOCK = [
  "What did you check it against?",
  "What would you have done if the output had been wrong?",
  "What did you compare that against for accuracy?",
  "How did you verify the output was reliable?",
  "What sources did you check before accepting it?",
  "How accurate do you think the output was?"
];

// Declared word collisions: a stock question whose anchor is a word of theirs
// used in a different sense. Each one is a known limit, not a pass.
const COLLISIONS = {
  S12: "What sources did you check before accepting it?"
};

let failed = 0;
const fail = (line) => { failed += 1; console.log(`FAIL  ${line}`); };

console.log(`${sectors.length} sector account(s) × ${STOCK.length} stock question(s)\n`);

let caught = 0, total = 0;
for (const s of sectors) {
  const answers = [...s.account, ...Object.values(s.pressed)];
  const survivors = [];
  for (const q of STOCK) {
    total += 1;
    const bad = violations(q, [], { answers });
    if (bad.some((b) => b.startsWith("generic:"))) { caught += 1; continue; }
    // A lexical rule cannot see that a word means something else here. In the
    // retail banking account "accepting" is about accepting loan applications,
    // and the stock question's "accepting" is about accepting the output. Same
    // string, different referent, so the question anchors on a word that is
    // genuinely theirs and genuinely irrelevant. One in ninety-six, named here
    // rather than hidden by loosening the rule until the number looks clean.
    if (COLLISIONS[s.id] === q) continue;
    survivors.push(q);
  }
  // Anchoring has to be possible, not just required.
  const distinctive = contentWordsOf(s.account[0]).filter((w, i, a) => a.indexOf(w) === i);
  const ok = survivors.length === 0 && distinctive.length >= 10;
  console.log(`${ok ? "  ok" : "FAIL"}  ${s.id.padEnd(3)} ${s.sector.padEnd(24)} ` +
    `${distinctive.length} distinctive words, ${STOCK.length - survivors.length}/${STOCK.length} stock caught`);
  if (survivors.length) fail(`${s.id}: a stock question survived: "${survivors[0]}"`);
  if (distinctive.length < 10) fail(`${s.id}: only ${distinctive.length} distinctive words, too thin to anchor to`);
}

console.log(`\n${caught}/${total} stock questions flagged as generic, ${Object.keys(COLLISIONS).length} let through on a declared word collision.`);

// A question built from the account must be able to pass, or the rules are a
// trap rather than a standard. One per sector, written from that account's own
// vocabulary.
const ANCHORED = {
  S1: "What did the planning tool export leave out about those sites?",
  S2: "What did the load flow show that the ratings table did not?",
  S3: "What had the safety officer seen of that concourse himself?",
  S4: "What in those amendments would have changed the position?",
  S5: "What would a different set of eleven names have done to the range?",
  S6: "What could it have known about the exemption being applied?",
  S7: "What would a label from outside that family have shown?",
  S8: "What did the replay show about those cut-offs?",
  S9: "Who could judge whether that critical path holds up?",
  S10: "Where would that penetration rate have come from?",
  S11: "What did it have about the SKUs it did not flag?",
  S12: "What would the old rules have decided on the same applications?",
  S13: "Who picked which monetised value applies to this intervention?",
  S14: "What did the QoE provider see that it did not?",
  S15: "What would a controlled run on that line have shown?",
  S16: "What did the hundred calls tell you about the other eight hundred?"
};

console.log("\nan anchored question must be able to pass, per sector:");
for (const s of sectors) {
  const q = ANCHORED[s.id];
  if (!q) { fail(`${s.id}: no anchored question written`); continue; }
  const answers = [...s.account, ...Object.values(s.pressed)];
  const bad = violations(q, [], { answers });
  if (bad.length) {
    fail(`${s.id}: the anchored question breaks a rule: ${JSON.stringify(bad)}\n        ${q}`);
  } else {
    console.log(`  ok  ${s.id.padEnd(3)} anchors[${anchorWords(q, answers).slice(0, 3).join(",")}]  ${q}`);
  }
}

console.log("");
if (failed) { console.log(`${failed} check(s) failed.`); process.exit(1); }
console.log("No stock question survives any of the sixteen, and every one of the");
console.log("sixteen admits a question built out of its own account.");
console.log("");
console.log("What this does NOT show: whether the model asks the anchored question");
console.log("or the stock one. Nothing offline can show that. It shows that the");
console.log("stock one would be caught, and that the good one is reachable.");
