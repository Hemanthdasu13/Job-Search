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
