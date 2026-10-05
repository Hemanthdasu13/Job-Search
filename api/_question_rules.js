// The question rules that have to run at request time, not only in tests.
//
// scripts/_rules.mjs has held these since 0.4.0 and the test suite has been
// catching the presupposition fault reliably. It shipped three times anyway,
// because a test runs against fixtures and the live question never passes
// through one:
//
//   "What did you weigh that recommendation against..."  -> "i cannot weigh"
//   "What did you give it about the next year MBA batch"  -> "nothing lol"
//   "What did you or the safety officer check the ratio against"
//                                                        -> "Nothing independent."
//
// Each of those cost a turn and pushed the person into answering about what
// they lacked. So the rules that can be checked cheaply live here, in api/,
// imported by both the handler and scripts/_rules.mjs. One source, enforced
// where the question is actually produced.

// Verbs naming an action the person may not have taken. "Do" and "happen"
// are deliberately absent: "what did you do once it gave you the name" is the
// reframe this rule pushes towards, and a rule that forbade its own remedy
// would leave nothing to ask.
const PRESUPPOSED = [
  "weigh", "check", "verify", "compare", "validate", "test", "cross-check",
  "crosscheck", "give", "tell", "provide", "send", "share", "show", "review",
  "flag", "confirm", "challenge", "question", "double-check"
].join("|");

// The subject may be compound. "What did you or the safety officer check the
// ratio against before you staffed to it?" went out live and was answered
// "Nothing independent." - and the first version of this pattern missed it,
// because it required the verb immediately after "you".
//
// The allowance is only a conjoined subject, not any words at all. A loose
// window of characters would flag "what did you do when the review came back",
// where "review" is a noun and nothing is presupposed.
const SUBJECT = "(?:you|they)(?:\\s+(?:or|and)\\s+(?:the\\s+)?[\\w'-]+(?:\\s+[\\w'-]+){0,2})?";

// And "what" need not sit against "did". "What, outside that model family,
// did you check the two hundred labels against?" went out live and was
// answered "Nothing outside the model." Each widening here came from a
// question that shipped: first the bare form, then a conjoined subject, now
// an interposed clause. The pattern is only ever as wide as the last failure,
// which is an argument for enforcing it where questions are made rather than
// where they are tested.
export const PRESUPPOSES_ACTION = new RegExp(
  `\\bwhat\\b[^?]{0,48}?\\b(?:did|do)\\s+${SUBJECT}\\s+(?:${PRESUPPOSED})\\b`, "i");

// A question answerable yes or no, and the either/or that is the same trade
// in longer clothes.
const AUX = "did|do|does|was|were|have|has|had|is|are|can|could|would|will|should";
export const OPENS_CLOSED = new RegExp(`^\\s*(?:${AUX})\\s+(?:you|it|they|anyone|anybody|that|this)\\b`, "i");
export const BOLTED_ON_CLOSED = new RegExp(`\\b(?:and|or)\\s+(?:${AUX})\\s+(?:you|it|they|anyone|anybody)\\b`, "i");

// A question that supplies candidate answers. NICHD calls this option-posing
// and ranks it one step above suggestive, which is the bottom of its scale.
//
// From a live run: "What about that specific night, such as the ticket mix or
// event type, sat outside what the ingress profile and incident logs
// covered?" - answered "Probably the ticket mix and the fixture itself."
// He handed back the two options he had been given. The question did not
// presuppose an action, so the rule above let it through; it presupposed the
// ANSWER, which is worse, because what comes back is no longer his.
//
// Only inside a question, and only the forms that name alternatives. "What
// did it have, the rate card or the invoices" is the same fault without the
// marker, and is not caught here - a question listing two nouns is sometimes
// the clearest way to ask, and the introduced-word rule is the one that
// should bound it.
export const SUGGESTS_ANSWER =
  /\b(?:such as|for example|for instance|e\.g\.|like)\b[^?]{0,60}?\bor\b/i;

// Where to fall back to when the model cannot produce a usable question and
// there is no time to keep asking. Deliberately dull: it presupposes nothing,
// carries no verification vocabulary so the anchor rule leaves it alone, and
// moves the conversation on instead of ending it.
//
// It exists because the alternatives are worse. Shipping the faulty question
// is what happened seven times. Shipping nothing showed a live visitor the
// string "(not shown)" where a question belonged.
// Asking the same thing again in different words.
//
// The axis classifier cannot see this. Three of these four returned nothing
// from it, and they are plainly one question asked four times:
//
//   "What would have shown you if one of those unflagged SKUs actually
//    needed a declaration change?"
//   "What would have happened to the print run if one of those unflagged
//    SKUs actually needed a declaration change?"
//   "If one of those unflagged SKUs went to print without the needed
//    declaration change, what would that have meant downstream?"
//   "If one of those unflagged SKUs had actually needed a declaration
//    change, what would that have meant once it reached shelves?"
//
// What is obvious about them is the vocabulary, not the topic. So the measure
// is overlap: how much of the shorter question's content is already in the
// one before it. Measured against the shorter one, because a long question
// that restates a short one is still a restatement.
// Half, not two thirds. These two are one question with the synonyms swapped
// - caught for surfaced, revenue recognition for earnings, before reaching IC
// for below the IC threshold - and they overlap by exactly a half:
//
//   "For targets it screened out before reaching IC, what would have caught a
//    similar revenue recognition issue there?"
//   "For targets that screened out below the IC threshold, what would have
//    surfaced a similar earnings issue there?"
//
// Lexical overlap cannot see a synonym, so the threshold has to sit where a
// half-reworded repeat still trips it. The shared-word floor below is what
// stops that being too eager.
export const REPEAT_OVERLAP = 0.5;

export function overlapWithPrevious(question, previous) {
  const a = new Set(contentWordsOf(question));
  const b = new Set(contentWordsOf(previous));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

// A ratio on its own is not enough, and the case that showed it is worth
// keeping: these two share "ratio" and "night" and are two thirds overlapped
// by the measure above, and they are not the same question at all -
//
//   "What would have happened on the concourse if that ratio had been wrong
//    on the night?"
//   "What did the ratio per turnstile bank take into account about that
//    night's crowd, beyond the ingress profile and past incident logs?"
//
// The first has only three content words, so sharing the subject is most of
// it. Sharing the subject is what a follow-up DOES. So a repeat needs both:
// a high proportion, and at least three words in common - which the stadium
// pair fails and every one of the four allergen questions passes.
export const REPEAT_SHARED_WORDS = 3;

export function repeatsPrevious(question, previous) {
  if (!question || !previous) return false;
  const a = new Set(contentWordsOf(question));
  const b = new Set(contentWordsOf(previous));
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  if (shared < REPEAT_SHARED_WORDS) return false;
  return overlapWithPrevious(question, previous) >= REPEAT_OVERLAP;
}

export const SAFE_QUESTIONS = [
  "What happened next, once it gave you that?",
  "Who else saw it before it was used?",
  "What did it have in front of it when it produced that?"
];

// Kept for callers that want one without knowing the conversation.
export const SAFE_QUESTION = SAFE_QUESTIONS[0];

// The first of these nobody has been asked yet. A live conversation got the
// fallback as its first question AND its third, word for word, because there
// was only one of them - so the safety net became the visible product and the
// tester marked both as questions that could have been asked about any
// account at all. Which they could.
//
// Three is not a fix for that, it is a floor under it. The fallback firing at
// all is the thing to watch, which is why it logs.
export function safeQuestion(asked = []) {
  const already = new Set((asked || []).map((q) => String(q).trim().toLowerCase()));
  return SAFE_QUESTIONS.find((q) => !already.has(q.toLowerCase())) || SAFE_QUESTIONS[0];
}

export const MAX_QUESTION_WORDS = 20;

// ------------------------------------------------------------- introduced words
//
// The NICHD investigative interview protocol ranks question types by how much
// they contaminate the account: open invitations first, then focused recall
// which may only address details the person has ALREADY mentioned, then
// option-posing sparingly, and suggestive utterances not at all.
//
// By that taxonomy this question is both option-posing and suggestive:
//
//   "What did that person actually know about the place - had they been
//    there recently, or were they just going on reputation?"
//
// "Recently" and "reputation" are the tool's words, not his. Both are ways
// of being inadequate, so the question hands over the answer it then
// receives. The rule that catches it is mechanical: a question may not
// introduce content words the person has not used.
//
// The allowlist is the scaffolding a question needs regardless of what was
// said - interrogatives, auxiliaries, pronouns, and the small set of frame
// words this tool asks in. Everything else has to come from them.
const SCAFFOLD = new Set(`
a an and the of to in on at for from with by about into over after before
what which where how who whom whose why when
did do does done was were is are am be been being have has had
can could would will shall should may might must
you your yours they them their it its this that these those there here
i me my we us our one anyone anybody someone something anything nothing
not no nor or if so then than as but also just only even still yet
actually really specifically instead rather otherwise beyond outside within
other another same different first next last own more most less least
thing things part parts bit piece case point side way ways
output outputs answer answers reply result results
know knew known knowing tell told telling say said saying
ask asked asking give gave given giving get got gets
use used using go went going come came coming
make made making take took taken taking
happen happened happens find found finds
look looked looking see saw seen read
think thought thinking mean meant means
let put kept keep need needed want wanted
produce produced produces able possible
time times long short once twice out
name names named call called
cost costs costing worth
wrong right wrongly
turn turned turns
decide decided deciding decision decisions
against like unlike such
myself yourself himself herself itself themselves ourselves
dont doesnt didnt cant couldnt wouldnt wasnt isnt werent arent
havent hasnt hadnt wont shouldnt
ai model tool system
`.trim().split(/\s+/));

const POSSESSIVE = /[’']s\b/g;

export function contentWordsOf(text) {
  return (String(text).toLowerCase().replace(POSSESSIVE, "")
    .match(/[\p{L}][\p{L}'’-]*/gu) || [])
    // "couldn't" is scaffolding spelled with punctuation in it, so the
    // apostrophe comes out before the lookup rather than the list carrying
    // every spelling of every contraction.
    .map((w) => w.replace(/['’]/g, "").replace(/^[-]+|[-]+$/g, ""))
    .filter((w) => w.length > 2 && !SCAFFOLD.has(w));
}

// A hyphenated coinage the tool built out of their words - "young-woman",
// "not-too-crowded" - is their content, not an introduction, so each half is
// checked separately rather than the whole as one unknown word.
function* partsOf(word) {
  yield word;
  if (word.includes("-")) for (const part of word.split("-")) if (part.length > 2) yield part;
}

// Two is the allowance, not zero: a question often needs one word of its own
// to point at what they described without quoting it back whole. Three is
// where it stops being their account and starts being the tool's.
export const MAX_INTRODUCED_WORDS = 2;

// The same question as anchorWords, asked the other way round, so it uses the
// same stemmer. Two stemmers would disagree about whose word a word is, and a
// question could then be both anchorless and introducing nothing.
export function introducedWords(question, answers = []) {
  if (!answers.length) return [];
  const theirs = new Set();
  for (const answer of answers) for (const word of contentWordsOf(answer)) {
    for (const part of partsOf(word)) for (const stem of stems(part)) theirs.add(stem);
  }
  const introduced = [];
  for (const word of contentWordsOf(question)) {
    const known = [...partsOf(word)].some((part) =>
      [...stems(part)].some((stem) => theirs.has(stem)) || sharesPrefix(part, theirs));
    if (!known && !introduced.includes(word)) introduced.push(word);
  }
  return introduced;
}

// ------------------------------------------------------------------ anchoring
//
// Carrying none of their words is not on its own the failure. "What were you
// going there for?" carries no content word at all once the scaffolding comes
// out, and it is a good question - it points at what they described through
// "there" rather than by repeating a noun. The first version of this rule
// flagged it, and flagged "what could it have known about the crowd on a
// given night", which is the best question the tool has produced.
//
// The failure is narrower: the tool's own verification vocabulary, with
// nothing of theirs attached. That is the question which would fit any
// account AND announces itself as a verification checklist while doing it.
export const FRAME = /\b(check|checks|checked|checking|verify|verified|verifying|verification|against|compare|compared|comparing|source|sources|sourced|output|outputs|accurate|accuracy|validate|validated|evidence|reliable|reliability)\b/i;

//
// The rules above bound what a question may INTRODUCE. Nothing until now
// required it to carry anything of theirs, so this passed every check:
//
//   "What did you check it against?"
//
// Nought introduced, under twenty words, one clause, no aside, no forced
// choice. It is also a question that would fit any account anybody has ever
// typed, which is the failure that costs this tool its reason to exist. The
// whole argument for asking questions instead of answering them is that the
// questions come from the account; a stock question is the moment a reader
// decides a general-purpose assistant would have done this anyway.
//
// So a question has to be anchored: at least one content word in it must be
// one they used. Not two - one is enough to make a question about their
// decision rather than about verification in general, and more would force
// the quoting-back that reads as parroting.
//
// The opening question is exempt. There is nothing to anchor to yet.
export const MIN_ANCHOR_WORDS = 1;


// Crude, deliberately. A stemmer that is clever enough to be wrong in ways
// nobody can predict is worse here than one whose mistakes are obvious: this
// decides whether a question counts as theirs, and being surprising about
// that is the failure. Both directions, because the first version only
// matched their longer word to a question's shorter one, so their "run" never
// matched a question's "running" and a good question about the retail banking
// rule sets was flagged as generic.
function stems(word) {
  const out = new Set([word]);
  for (const suffix of ["s", "es", "ed", "ing", "d"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) out.add(word.slice(0, -suffix.length));
    out.add(word + suffix);
  }
  if (word.endsWith("e")) out.add(word.slice(0, -1) + "ing");
  if (word.endsWith("y")) out.add(word.slice(0, -1) + "ies");
  return out;
}

// English morphology the suffix list does not reach: "shown" against their
// "shows", "ran" against their "run". A shared prefix of five characters is
// the fallback - long enough that "contention" and "contract" stay apart, and
// crude enough to stay predictable.
const PREFIX = 5;
function sharesPrefix(word, theirs) {
  if (word.length < PREFIX) return false;
  const head = word.slice(0, PREFIX);
  for (const t of theirs) if (t.length >= PREFIX && t.slice(0, PREFIX) === head) return true;
  return false;
}

export function anchorWords(question, answers = []) {
  if (!answers.length) return [];
  const theirs = new Set();
  for (const answer of answers) for (const word of contentWordsOf(answer)) {
    for (const part of partsOf(word)) for (const stem of stems(part)) theirs.add(stem);
  }
  const anchored = [];
  for (const word of contentWordsOf(question)) {
    // A shared verification verb is not an anchor. "Check" appearing in their
    // answer does not make "what did you check it against" a question about
    // their decision - it is the frame word that made it generic in the first
    // place, and twenty of ninety-six stock questions got through on exactly
    // that before this line existed.
    if (FRAME.test(word)) continue;
    const hit = [...partsOf(word)].some((part) =>
      [...stems(part)].some((stem) => theirs.has(stem)) || sharesPrefix(part, theirs));
    if (hit && !anchored.includes(word)) anchored.push(word);
  }
  return anchored;
}


export function wordCount(text) {
  return (String(text).trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

// What the handler refuses and asks again for. Deliberately a short list: a
// regeneration costs a provider call, so only the faults that reliably ruin
// the turn are worth one. Length and asides make a question hard to read;
// these three make it produce the wrong answer.
// `answers` is optional only because the opening question has none. With it,
// the two rules that need the account can run at request time as well: a
// question built mostly out of the tool's own words, and a question that
// announces itself as a verification checklist while carrying nothing of
// theirs.
//
// The runtime thresholds are looser than the test's on purpose. verify-questions
// fails a question introducing three words because that is the standard to
// write to; the handler only pays for a regeneration at five, because a call
// spent turning a slightly wordy question into a different slightly wordy
// question buys nothing. Same for length: the test holds the line at twenty,
// the handler steps in at twenty-five. Two good live questions were
// twenty-two words and regenerating them would have made the tool worse and
// slower at once.
export function hardFault(question, answers = []) {
  const q = String(question || "");
  if (PRESUPPOSES_ACTION.test(q)) {
    return `presupposes an action they may not have taken: "${q.match(PRESUPPOSES_ACTION)[0]}"`;
  }
  if (OPENS_CLOSED.test(q)) return "answerable yes or no";
  if (BOLTED_ON_CLOSED.test(q)) return "two questions in one";
  if (SUGGESTS_ANSWER.test(q)) {
    return `supplies the answer: "${q.match(SUGGESTS_ANSWER)[0].slice(0, 48)}"`;
  }
  if (wordCount(q) > MAX_QUESTION_WORDS + 5) return `${wordCount(q)} words`;

  if (answers.length) {
    const introduced = introducedWords(q, answers);
    if (introduced.length > MAX_INTRODUCED_WORDS + 2) {
      return `is built from ${introduced.length} words they never used: ${introduced.slice(0, 5).join(", ")}`;
    }
    // The differentiator, enforced. A question carrying the tool's own
    // verification vocabulary and nothing of theirs would fit any account
    // anybody has ever typed, which is the moment a reader decides a
    // general-purpose assistant would have done this just as well.
    if (!anchorWords(q, answers).length && FRAME.test(q)) {
      return `asks about "${q.match(FRAME)[0]}" and carries no word of theirs`;
    }
  }
  return null;
}
