// The question rules, pinned to the conversations that produced them.
//
// Every rule in scripts/_rules.mjs exists because a live question broke
// something, so the fixtures here are real questions this deployment asked,
// not invented ones. The restaurant conversation is the whole set: six
// questions, every one of which breaks at least one rule, and the owner's
// complaint about it was precise - he had to re-read them, and they kept
// leading him to answer that he had not had enough information.
//
// Each MUST-FLAG fixture names the rule it is here to catch, so a change
// that stops catching it fails with the reason rather than a count.
//
// The MUST-PASS fixtures are the same six turns rewritten inside the rules.
// They matter more than the flags: a rule set that only rejects is a rule
// set nobody can write a question under, and the rewrite is the proof that
// a question can still do its job in twenty words of the person's own
// vocabulary.

import { violations, wordCount, introducedWords, MAX_QUESTION_WORDS } from "./_rules.mjs";

// What he typed, in order. A question asked after answer N may only draw on
// answers 1..N - quoting an answer that has not been given yet is the same
// contamination as inventing the word, and the slice is what catches it.
const RESTAURANT = [
  "I was using it to recommend me for a restaurant/ pub near soho",
  "I cannot weigh, I'm new to the place. But once I got the recommendation, I asked someone they said yeah it's a cool place",
  "Local guy",
  "I was looking to hookup",
  "Wasted money and day.",
  "It said me that it's a nice place with lot of young woman. Not too crowdy so can find time for introductions etc",
  "That's AI reasoning, i wouldn't know much"
];

const MUST_FLAG = [
  { turn: 1, expect: /presupposes they did it/,
    q: "What did you weigh that recommendation against before deciding where to actually go?",
    why: "He answered 'I cannot weigh, I'm new to the place.' The weighing was the question's assumption, and correcting it is what produced an answer about what he lacked." },

  { turn: 2, expect: /introduces \d+ words they never used/,
    q: "What did that person actually know about the place—had they been there recently, or were they just going on reputation?",
    why: "'Recently' and 'reputation' are the tool's words. Both are ways of being inadequate, so the question hands over the answer it then receives." },

  { turn: 3, expect: /words, max 20/,
    q: "What was riding on this choice—were you going for a casual drink or something like marking an occasion—if the place had turned out wrong for that?",
    why: "Twenty-eight words, two asides, and seven introduced words. The worst question in the set, and the one whose real answer was neither option offered." },

  { turn: 4, expect: /words, max 20/,
    q: "If the place had turned out to be the wrong vibe for that, what would that have cost you that evening?",
    why: "Asks what turn three already asked. Two of six turns spent on the same ground." },

  { turn: 5, expect: /words, max 20/,
    q: "Beyond picking a name for you, what did it actually tell you about the place that you couldn't have found yourself with a quick search?",
    why: "Twenty-five words to ask what it bought him." },

  { turn: 6, expect: /carries an aside/,
    q: "Where would that read on the young-woman, not-too-crowded part have come from—what could it have actually known about that place's crowd on a given night?",
    why: "The best question of the six, and still twenty-six words with an aside. 'What could it have known about the crowd on a given night' is thirteen and asks the same thing." }
];

// The same conversation, inside the rules.
//
// The first two of these read fine and failed when the anchor rule arrived:
// "What did you do once it gave you the name of the place?" carries nothing
// he had written at turn one - "place" is his word from turn TWO - and "What
// had that someone seen of it themselves?" has no content word at all once
// the scaffolding is removed. Both would have fitted any account. Rewritten
// to carry one of his: "recommend" and "place".
const MUST_PASS = [
  { turn: 1, q: "What did you do once it recommended somewhere?" },
  { turn: 2, q: "What had that someone seen of the place themselves?" },
  { turn: 3, q: "What were you going there for?" },
  { turn: 4, q: "What would going to the wrong one have cost you?" },
  { turn: 5, q: "What could it have known about the crowd on a given night?" },
  { turn: 6, q: "Where would that reasoning about young women have come from?" }
];

// A first question has no answers to draw on yet, so the introduced-word
// rule has nothing to measure and must not fire. It fired on everything once,
// which would have failed every opening question ever asked.
const OPENERS = [
  "What did you use it for, and what happened to what it produced?",
  "What was the piece of work?"
];

let failed = 0;
const fail = (line) => { failed += 1; console.log(`FAIL  ${line}`); };

console.log("must flag - real questions, with the rule each is here to catch");
for (const f of MUST_FLAG) {
  const bad = violations(f.q, [], { answers: RESTAURANT.slice(0, f.turn) });
  const hit = bad.some((b) => f.expect.test(b));
  if (!bad.length) fail(`turn ${f.turn}: nothing flagged at all`);
  else if (!hit) fail(`turn ${f.turn}: flagged ${JSON.stringify(bad)}, none matching ${f.expect}`);
  else console.log(`  ok  turn ${f.turn} (${wordCount(f.q)}w, ${bad.length} rule(s)): ${bad[0]}`);
}

console.log("\nmust pass - the same six turns, rewritten inside the rules");
for (const f of MUST_PASS) {
  const bad = violations(f.q, [], { answers: RESTAURANT.slice(0, f.turn) });
  if (bad.length) fail(`turn ${f.turn} rewrite: ${JSON.stringify(bad)}\n        ${f.q}`);
  else console.log(`  ok  turn ${f.turn} (${String(wordCount(f.q)).padStart(2)}w): ${f.q}`);
}

console.log("\nmust pass - an opening question, with no answers to draw on yet");
for (const q of OPENERS) {
  const bad = violations(q, [], { answers: [] });
  if (bad.length) fail(`opener: ${JSON.stringify(bad)}\n        ${q}`);
  else console.log(`  ok  ${q}`);
}

// Boundaries, so the limit is the limit rather than roughly the limit.
console.log("\nboundaries");
// Built to length rather than counted by hand. The hand-counted version of
// this fixture was eighteen words and claimed to be twenty, so the boundary
// it was asserting was never the boundary.
const atLimit = (n) => "What did it have to work from " + Array.from({ length: n - 7 }, () => "there").join(" ");
const twenty = atLimit(MAX_QUESTION_WORDS);
const twentyOne = atLimit(MAX_QUESTION_WORDS + 1);
if (wordCount(twenty) !== MAX_QUESTION_WORDS) fail(`fixture is ${wordCount(twenty)} words, meant to be ${MAX_QUESTION_WORDS}`);
if (wordCount(twentyOne) !== MAX_QUESTION_WORDS + 1) fail(`fixture is ${wordCount(twentyOne)} words, meant to be ${MAX_QUESTION_WORDS + 1}`);
if (violations(twenty + "?", [], {}).some((b) => /words, max/.test(b))) fail("20 words was flagged; the limit is inclusive");
else console.log(`  ok  ${MAX_QUESTION_WORDS} words passes`);
if (!violations(twentyOne + "?", [], {}).some((b) => /words, max/.test(b))) fail("21 words was not flagged");
else console.log(`  ok  ${MAX_QUESTION_WORDS + 1} words flags`);

// The introduced-word rule has to be about content, not about inflection.
const theirs = ["i asked it to recommend a restaurant and it gave me a recommendation"];
const inflected = "What did that recommendation actually recommend?";
if (introducedWords(inflected, theirs).length) {
  fail(`inflection counted as introduced: ${introducedWords(inflected, theirs).join(", ")}`);
} else console.log("  ok  an inflection of their own word is not an introduction");

// Every leading question that actually reached a visitor, against the rule as
// api/ask.js runs it. Each one widened the pattern: the bare form, then a
// conjoined subject ("you or the safety officer"), then an interposed clause
// ("what, outside that model family, did you check"), then a question
// supplying its own answer ("such as the ticket mix or event type") - which
// was handed straight back. This block exists because verify-questions passed
// while every one of them shipped: it tested scripts/_rules.mjs, and nothing
// tested the function the handler calls.
console.log("\nevery leading question that shipped, against the handler's own check:");
const { hardFault } = await import("../api/_question_rules.js");
for (const q of [
  "What did you weigh that recommendation against before deciding where to actually go?",
  "What did you give it about the next year MBA batch that shaped what it wrote?",
  "What did you tell it about the new MBA batch that shaped the script?",
  "What did you or the safety officer check the ratio against before you staffed to it?",
  "What, outside that model family, did you check the two hundred labels against?",
  "What about that specific night, such as the ticket mix or event type, sat outside what the ingress profile and incident logs covered?"
]) {
  const f = hardFault(q);
  if (!f) fail(`the handler would still ship: ${q}`);
  else console.log(`  ok  ${f.slice(0, 64)}`);
}

// And the good ones must survive, including two from the same live run. A
// check that regenerated these would spend a call to make a question worse.
console.log("\ngood questions the check must leave alone:");
for (const q of [
  "What did you do once it recommended somewhere?",
  "What did you do when the review came back?",
  "What could it have known about the crowd on a given night?",
  "What would have happened on the concourse if that ratio had been wrong on the night?",
  "What did the ratio per turnstile bank take into account about that night's crowd, beyond the ingress profile and past incident logs?",
  "What had that someone seen of the place themselves?",
  "What did it have, the rate card or the invoices?"
]) {
  const f = hardFault(q);
  if (f) fail(`would regenerate a good question: ${q}\n        ${f}`);
  else console.log(`  ok  ${q.slice(0, 64)}`);
}

// Asking the same thing again. One live conversation asked four versions of
// one question and another asked three, both of which read as not listening -
// which is worse than a leading question, because the person has already
// answered. Pinned as real sequences: every consecutive pair, with the verdict
// each one has to get.
console.log("\nasking it again in different words:");
const { repeatsPrevious } = await import("../api/_question_rules.js");
const SEQUENCES = [
  ["allergen", "repeat", [
    "What would have shown you if one of those unflagged SKUs actually needed a declaration change?",
    "What would have happened to the print run if one of those unflagged SKUs actually needed a declaration change?",
    "If one of those unflagged SKUs went to print without the needed declaration change, what would that have meant downstream?",
    "If one of those unflagged SKUs had actually needed a declaration change, what would that have meant once it reached shelves?"
  ]],
  ["private equity", "repeat", [
    "For targets it screened out before reaching IC, what would have caught a similar revenue recognition issue there?",
    "For targets that screened out below the IC threshold, what would have surfaced a similar earnings issue there?"
  ]],
  // Two that share only their subject. A follow-up reuses the noun; that is
  // what a follow-up is, and calling it a repeat would regenerate good
  // questions and spend a call doing it.
  ["stadium", "fine", [
    "What would have happened on the concourse if that ratio had been wrong on the night?",
    "What did the ratio per turnstile bank take into account about that night's crowd, beyond the ingress profile and past incident logs?",
    "What about that specific night, such as the ticket mix or event type, sat outside what the ingress profile and incident logs covered?"
  ]],
  ["restaurant", "fine", [
    "What did you do once it recommended somewhere?",
    "What had that someone seen of the place themselves?",
    "What were you going there for?",
    "What could it have known about the crowd on a given night?"
  ]]
];
for (const [name, verdict, qs] of SEQUENCES) {
  for (let i = 1; i < qs.length; i++) {
    const got = repeatsPrevious(qs[i], qs[i - 1]);
    const want = verdict === "repeat";
    if (got !== want) {
      fail(`${name} Q${i}->Q${i + 1} should be ${verdict}\n        ${qs[i]}`);
    }
  }
  console.log(`  ok  ${name}: every consecutive pair reads as ${verdict}`);
}

// The fallback has to survive its own rules, or a faulty question gets
// replaced by another faulty question.
const { SAFE_QUESTION } = await import("../api/_question_rules.js");
if (hardFault(SAFE_QUESTION, ["I used it to draft a supplier comparison."])) {
  fail(`the safe fallback breaks a rule: ${hardFault(SAFE_QUESTION, ["x"])}`);
} else {
  console.log(`  ok  the safe fallback breaks no rule: "${SAFE_QUESTION}"`);
}

// Every fault has to carry a remedy, because the refusal on its own did not
// work. Told five times in one evening that its question presupposed an
// action, the model came back with the same shape each time - "What did you
// tell" became "What constraints or limits did you give" - and twice
// exhausted the retry, shipping a canned question to a visitor instead.
//
// A fault with no remedy is a regeneration paid for and steered by nothing,
// so this pins one against every class the handler can refuse. Add a fault
// without a remedy and this fails.
console.log("\nevery fault names what to do instead:");
const { remedyFor } = await import("../api/_question_rules.js");
const FAULT_CLASSES = [
  ["presupposed action", "What did you tell it about the batch that shaped the script?", []],
  ["yes or no", "Did you check the figure before it went out?", []],
  ["two in one", "What did it have in front of it and did you look at it?", []],
  ["option-posing", "What sat outside that, such as the ticket mix or the event type?", []],
  ["too long", "What did it have in front of it when it produced the number that went "
    + "into the pack that the board then approved on the night in question here now?", []],
  ["built from the tool's words", "What did the forecast assume about seasonality, "
    + "amortisation, covenants, drawdown, recoverability and phasing?",
    ["I used it to build a cash forecast from the bank data."]],
  // Anchorless and announcing itself as a verification checklist, without
  // presupposing anything - the presupposition rule runs first, so a fixture
  // using "you check" would test that remedy twice and this one never.
  ["anchorless verification vocabulary", "What could it have been checked against?",
    ["I used it to build a cash forecast from the bank data."]]
];
for (const [name, q, answers] of FAULT_CLASSES) {
  const f = hardFault(q, answers);
  if (!f) { fail(`${name}: no fault raised, so the remedy is untested: ${q}`); continue; }
  const r = remedyFor(f);
  if (!r) fail(`${name}: fault with no remedy: ${f}`);
  else console.log(`  ok  ${name} -> ${r.slice(0, 56)}`);
}
// The repeat fault comes from the handler rather than hardFault, so it is
// pinned by its exact wording.
for (const f of ["asks the last question again in different words", "the same question again"]) {
  if (!remedyFor(f)) fail(`no remedy for: ${f}`);
  else console.log(`  ok  ${f.slice(0, 40)} -> has a remedy`);
}

// The question the widened threshold exists for. It names the one thing the
// account did not cover, which is the job; the handler used to regenerate it
// and then ship a canned question in its place.
const namesTheGap = "What did the forecast assume about timing or payments compared with what the actuals showed?";
const forecast = ["I used it to build an eighteen month cash flow forecast from three years of "
  + "monthly bank actuals and the approved budget."];
if (hardFault(namesTheGap, forecast)) {
  fail(`the handler would still throw away the question that names the gap: ${hardFault(namesTheGap, forecast)}`);
} else {
  console.log(`  ok  a question may name the thing they did not cover`);
}

console.log("");
console.log("Enforced here: length, asides, presupposed action, introduced words,");
console.log("the anchor rule (verification vocabulary with no word of theirs in it),");
console.log("two-questions-in-one, yes/no openings, either/or, research words,");
console.log("advice, assertions, repeated questions, confidential detail.");
console.log("Asked for in the prompt but NOT enforced: one clause per question, and");
console.log("mechanism over detection. A compound open question - \"what could you");
console.log("check, and what could you not\" - is deliberately left alone, because");
console.log("the shape is sometimes right and the word limit already bounds it.");
console.log("");

if (failed) {
  console.log(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log("Question rules hold against every question the restaurant conversation produced.");
