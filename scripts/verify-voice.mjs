// How the research is allowed to be referred to on screen.
//
//   node scripts/verify-voice.mjs
//
// One noun: the research. Not "participants", not "one participant", not "the
// study", not "the interviews", not "someone said". Counts stay, because the
// counts are the evidence. A finding resting on a single case is still marked
// as one case, but without narrating a person.
//
// This exists because the rule was given twice and broken twice. Sixteen of
// the seventeen cards were written as "five participants had adopted", "one
// argued", "one stated it as a hiring rule" - which reads like a write-up of
// a focus group rather than someone telling you what they found out. A rule
// that lives only in a conversation is a rule that comes back.
//
// Two allowances, both deliberate:
//
//   the caveat   "Eighteen interviews, sixteen sectors..." is a citation, not
//                prose. It appears once per closing screen, under a rule, in
//                mono, and it is mandated verbatim by RESEARCH_FACTS.md.
//   the offer    "I'd contribute an interview" is a link offering to be
//                interviewed. It is not attribution.

import { readFileSync } from "node:fs";

// Every page a visitor reads. research.html is prose about the research from
// end to end, so it is the page most likely to slip back into the register.
const PAGES = ["public/index.html", "public/research.html"];
const src = PAGES.map((p) => readFileSync(p, "utf8")).join("\n");

// The mandated caveat, and the standing link. Removed before checking so they
// cannot be mistaken for prose, and asserted separately below.
// The count came off it. Eighteen across sixteen sectors invites a reader to
// divide and conclude it is thin, and the counts that carry weight are on the
// claims themselves - "four of twelve", "seven times" - where anyone checking
// would actually look.
const CAVEAT =
  "Sixteen sectors. Exploratory qualitative research, single coder, not a validated instrument.";
const OFFER = "I'd contribute an interview";

const BANNED = [
  [/\bparticipants?\b/gi, 'say "the research"'],
  [/\bthe interviews?\b/gi, 'say "the research"'],
  [/\bthe study\b/gi, 'say "the research"'],
  // "Not one described a rule for when to believe what came out" is the
  // landing page's hinge and the wording the facts file requires, so the ban
  // is on the attributing form only.
  [/(?<!\bnot )\bone (?:stated|argued|described|said|framed|identified)\b/gi,
   'say "one case in the research"'],
  [/\bsomeone (?:said|described|told)\b/gi, 'say "one case in the research"'],
  [/\bwe interviewed\b/gi, 'say "the research"'],
  [/\bin the sample\b/gi, 'say "in the research"'],
  // Off the tool entirely. It survives in the research page's methods
  // paragraph, which that page checks for itself, and nowhere a visitor
  // meets a finding.
  [/\beighteen interviews\b/gi, 'the count comes off the caveat']
];

// Only what a visitor reads: the card bodies and the closing-screen prose.
// Code comments are for whoever maintains this and are left alone.
function visibleStrings() {
  const out = [];

  const cards = src.match(/var PRACTICES = \{[\s\S]*?\n  \};/);
  if (!cards) throw new Error("could not find the card library");
  for (const m of cards[0].matchAll(/(concept|principle|why|action): "((?:[^"\\]|\\.)*)"/g)) {
    out.push({ where: `card ${m[1]}`, text: JSON.parse(`"${m[2]}"`) });
  }

  // Markup inside the screens, tags stripped.
  for (const s of src.matchAll(/<section class="screen"[^>]*id="(s\d[a-z]?g?)"[^>]*>([\s\S]*?)<\/section>/g)) {
    const id = s[1];
    for (const el of s[2].matchAll(/<(h1|h2|h3|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/g)) {
      const text = el[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text) out.push({ where: id, text });
    }
  }

  // research.html has no screens; its whole <main> is prose to be checked.
  for (const m of src.matchAll(/<main>([\s\S]*?)<\/main>/g)) {
    for (const el of m[1].matchAll(/<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/g)) {
      const text = el[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text) out.push({ where: "research page", text });
    }
  }

  // Strings the script writes into the page at runtime.
  for (const m of src.matchAll(/textContent = "((?:[^"\\]|\\.)*)"/g)) {
    out.push({ where: "runtime text", text: JSON.parse(`"${m[1]}"`) });
  }
  for (const m of src.matchAll(/^\s*" ((?:[^"\\]|\\.)*)";$/gm)) {
    out.push({ where: "runtime text", text: JSON.parse(`" ${m[1]}"`) });
  }
  return out;
}

const failures = [];
for (const { where, text } of visibleStrings()) {
  const stripped = text.split(CAVEAT).join(" ").split(OFFER).join(" ");
  for (const [re, fix] of BANNED) {
    for (const hit of stripped.match(re) || []) {
      failures.push({ where, hit, fix, text: stripped.slice(0, 100) });
    }
  }
}

// How often a screen may cite the research at all. Said once it is a
// citation; said five times on one screen - which is what three cards each
// carrying their own attribution produced - it reads as insisting, and the
// page sounds like it is arguing for its own credibility. The header scopes
// the screen, the footnote carries the caveat, and the cards say nothing.
const CITE = /\bresearch\b/gi;
const MAX_CITES_PER_SCREEN = 2;
for (const m of src.matchAll(/<section class="screen"[^>]*id="(s\d[a-z]?g?)"[^>]*>([\s\S]*?)<\/section>/g)) {
  const text = m[2].replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
  const hits = (text.match(CITE) || []).length;
  if (hits > MAX_CITES_PER_SCREEN) {
    failures.push({
      where: m[1],
      hit: `cites the research ${hits} times`,
      fix: `at most ${MAX_CITES_PER_SCREEN} per screen: the header scopes it, the footnote caveats it`,
      text: ""
    });
  }
}

// The caveat must still be present, verbatim, on each of the three closing
// screens. Dropping it is the opposite failure and just as easy to make.
const caveats = (src.match(new RegExp(CAVEAT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
if (caveats < 3) {
  failures.push({
    where: "closing screens",
    hit: `caveat present ${caveats} times`,
    fix: "it is mandated verbatim on 5A, 5B and 5C",
    text: CAVEAT
  });
}

// ------------------------------------------------------------------ sentence length
//
// Nothing a visitor reads may run past twenty-four words in one sentence.
//
// The owner's note: "language punchy and straight, not english professor".
// He was right. The takeaway on a gap card ran to thirty-five words, the
// first screen asked for "a recent piece of work where AI output fed into
// something that mattered. A decision, a recommendation, an analysis someone
// else relied on" before anyone had typed a word, and a friend of his got two
// sentences in and said it was too complex.
//
// Twenty-four, because the longest thing left after the cut is a
// twenty-three-word pair of plain clauses and the ones that broke the rule
// were all stacking subordinate clauses to get there. Paragraphs may be as
// long as they need to be; the sentences inside them may not.
const MAX_SENTENCE_WORDS = 24;

// Also splits "...hasn't.A wrong answer..." - visibleStrings joins adjacent
// elements with no space between them, and without this a pair of short
// sentences from two tags reads as one long one.
const sentencesOf = (text) =>
  String(text).split(/(?<=[.?!])\s+|(?<=[.?!])(?=[A-Z“"])/);
const countWords = (text) => (String(text).match(/[A-Za-z0-9'\u2019-]+/g) || []).length;

// Where the limit is enforced, and where it is only counted.
//
// Enforced on the screens, which is where the reading resistance is: nobody
// chooses to read those, they are simply in the way.
//
// Counted, not enforced, on the research prose - the "why this one keeps
// coming up" paragraph behind a disclosure, and the research page. Those are
// findings, written by the researcher, and every claim in them is text a
// person wrote rather than text a model produced. Splitting one of those
// sentences is an edit to a research claim and belongs to him, not to a test.
// So they are reported each run and nobody can forget about them.
const RESEARCH_PROSE = /^(card why|research page)$/;

const longSentences = [];
for (const { where, text } of visibleStrings()) {
  for (const sentence of sentencesOf(text)) {
    const words = countWords(sentence);
    if (words > MAX_SENTENCE_WORDS) {
      longSentences.push({ where, words, sentence: sentence.trim() });
    }
  }
}
for (const hit of longSentences) {
  if (RESEARCH_PROSE.test(hit.where)) continue;
  failures.push({
    where: hit.where,
    hit: `${hit.words} words in one sentence`,
    fix: `at most ${MAX_SENTENCE_WORDS}: break it in two, or cut it`,
    text: hit.sentence.slice(0, 120)
  });
}
const inResearch = longSentences.filter((h) => RESEARCH_PROSE.test(h.where));
if (inResearch.length) {
  console.log(`${inResearch.length} long sentence(s) left in the research prose, `
    + `longest ${Math.max(...inResearch.map((h) => h.words))} words `
    + `(not enforced: those are claims he wrote)`);
}
console.log(`longest sentence on a screen: ${Math.max(0, ...visibleStrings()
  .filter((v) => !RESEARCH_PROSE.test(v.where))
  .flatMap((v) => sentencesOf(v.text).map(countWords)))} words, limit ${MAX_SENTENCE_WORDS}`);

// ------------------------------------------------------------------- register
//
// Contractions, in the copy a visitor reads.
//
// This is the thing the owner could feel and could not name: "I basically
// want it non-English professor type lengthy sentences, something very simple
// and conversational. Now, how do I tell you, I do not know."
//
// The answer turned out to be mechanical. The page had seventeen uncontracted
// auxiliary negations in its visible copy - "Attention does not catch
// errors", "That is the judgement", "the inputs were not" - and nobody says
// any of those out loud. Sentence length was only half of it; the other half
// is that formal English spells out what speech contracts.
//
// Only the auxiliary forms, and deliberately not "is not" standing alone as a
// claim: "silence is not safety" is the finding, and contracting it would
// soften the one line that has to land.
//
// Not applied to the research prose, same as the length rule: his voice there
// is his to set.
const SPELLED_OUT = /\b(do not|does not|did not|can not|cannot|was not|were not|would not|could not|should not|have not|has not|had not|will not|is not able|that is|it is) \b/gi;

for (const { where, text } of visibleStrings()) {
  if (RESEARCH_PROSE.test(where)) continue;
  for (const m of String(text).matchAll(SPELLED_OUT)) {
    // "that is" and "it is" only where they open a sentence or a clause, which
    // is where they read as a lecture rather than as emphasis.
    const before = String(text).slice(Math.max(0, m.index - 2), m.index);
    if (/^(that is|it is)$/i.test(m[1]) && !/^$|[.?!]\s?$/.test(before)) continue;
    failures.push({
      where,
      hit: `"${m[1]}" spelled out`,
      fix: "contract it: nobody says that out loud",
      text: String(text).slice(Math.max(0, m.index - 40), m.index + 40)
    });
  }
}

for (const f of failures) {
  console.error(`FAIL ${f.where}: "${f.hit}" - ${f.fix}\n       ${f.text}`);
}
console.log(`checked visible copy; caveat appears ${caveats} times`);
if (failures.length) {
  console.error(`\n${failures.length} voice check(s) failed`);
  process.exit(1);
}
console.log("voice checks passed: the research is the only thing cited");
