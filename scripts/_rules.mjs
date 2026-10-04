// The constraints the brief actually states, in one place, so the live probe
// and the model comparison cannot disagree about what "obeying" means.

export const RESEARCH_WORDS = /\b(eighteen|sixteen|twelve|interviews?|the study|my research|participants?|respondents?|findings?)\b/i;
export const ADVICE_PHRASES = /\b(you should|I recommend|I'd suggest|I would suggest|my advice|it's worth|you ought to|make sure you|try to)\b/i;
export const ASSERTION_PHRASES = /\b(this (?:means|shows|suggests)|that (?:means|shows|suggests)|in fact|clearly,|the problem is)\b/i;

// Counting question marks is not enough. The first live question this
// deployment produced was:
//
//   "What data did you actually feed it to produce that pricing analysis,
//    and did you verify those underlying figures were current before they
//    went into the board pack?"
//
// One question mark, two questions, and the second is closed. Asked that
// way the person answers whichever half is easier, usually the yes/no one,
// and the turn produces nothing. So: a closed clause bolted on with "and"
// or "or", and a question that opens closed.
//
// Deliberately not flagging "and what/which/how", because a compound open
// question is often the right shape - "which part could you check, and
// which part could you not" is one question with two halves, and a good one.
const AUX = "did|do|does|was|were|have|has|had|is|are|can|could|would|will|should";
export const BOLTED_ON_CLOSED = new RegExp(`\\b(?:and|or)\\s+(?:${AUX})\\s+(?:you|it|they|anyone|anybody)\\b`, "i");
export const OPENS_CLOSED = new RegExp(`^\\s*(?:${AUX})\\s+(?:you|it|they|anyone|anybody|that|this)\\b`, "i");

// An either/or question. The prompt bans yes or no and this is the same
// trade in longer clothes: "was that done on the current data, or on the
// earlier models" was answered, in a real conversation, with "both actually"
// - which is a dodge the form invited. A closed question with two doors is
// still a closed question.
//
// Only flagged when the question opens on an auxiliary, which is what makes
// the alternatives exhaustive. "What did you check it against, or did you
// not" is caught by BOLTED_ON_CLOSED already, and a genuine open question
// listing examples - "what did it have: the rate card, the invoices, or
// something else" - is left alone, because the answer is not one of them.
export const CLOSED_ALTERNATIVES = new RegExp(
  `^\\s*(?:${AUX})\\b[^?]*\\bor\\b[^?]*\\?`, "i");

// -------------------------------------------------------------------- length
//
// Twenty words. The questions this deployment produced averaged twenty-two,
// and the owner's complaint was not that they were long but that he had to
// re-read them to work out what was being asked. Length is the proxy that
// can be checked; the circularity is what it stands in for.
//
// The best question in the restaurant log was twenty-six words:
//
//   "Where would that read on the young-woman, not-too-crowded part have
//    come from - what could it have actually known about that place's crowd
//    on a given night?"
//
// It is also the same question as "what could it have known about the crowd
// on a given night", which is thirteen. Nothing was lost by the cut, which
// is why the limit is set where a good question still fits.
export const MAX_QUESTION_WORDS = 20;

export function wordCount(text) {
  return (String(text).trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

// An aside inside a question. Three of the six questions in the restaurant
// log carried one, and an aside is how a question acquires a second idea
// without acquiring a second question mark - which is the shape the person
// reading it has to unpick before answering.
export const ASIDE = /\u2014|\u2013|\s-\s|\(|\)|;/;

// ------------------------------------------------------- presupposed action
//
// "What did you weigh that recommendation against before deciding where to
// actually go?" was answered "I cannot weigh, I'm new to the place."
//
// The question presupposes the weighing. Someone who did not weigh it has to
// correct the question before they can answer it, and the easiest way to
// correct it is to say what they lacked - which is how a question about
// checking turns into an answer about missing information. Ask what happened
// instead: "what did you do once it gave you the name" presupposes nothing.
const PRESUPPOSED = "weigh|check|verify|compare|validate|test|cross-check|crosscheck";
export const PRESUPPOSES_ACTION = new RegExp(
  `\\bwhat (?:did|do) (?:you|they)\\s+(?:${PRESUPPOSED})\\b`, "i");

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

export function introducedWords(question, answers = []) {
  if (!answers.length) return [];
  const theirs = new Set();
  for (const answer of answers) for (const word of contentWordsOf(answer)) {
    for (const part of partsOf(word)) theirs.add(part);
    // Their own stemming, roughly: "recommend" covers "recommendation", so a
    // question is not flagged for inflecting a word they used.
    if (word.length > 5) theirs.add(word.slice(0, -1));
    if (word.length > 6) theirs.add(word.slice(0, -2));
  }
  const introduced = [];
  for (const word of contentWordsOf(question)) {
    const known = [...partsOf(word)].some((part) =>
      theirs.has(part) || (part.length > 5 && (theirs.has(part.slice(0, -1)) || theirs.has(part.slice(0, -2))))
      || [...theirs].some((t) => t.length > 4 && part.startsWith(t.slice(0, Math.max(4, t.length - 2)))));
    if (!known && !introduced.includes(word)) introduced.push(word);
  }
  return introduced;
}

export function sentenceCount(text) {
  return text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
}

// Returns a list of the rules this question breaks. Empty means it obeyed.
//
// The third argument used to be the questions already asked. It still is, so
// that every existing caller keeps working, but passing an object instead
// carries the answers too - which the introduced-word rule needs, because
// whether a word is the tool's or theirs is not a property of the question
// alone.
export function violations(question, secrets = [], seenOrOptions = []) {
  const options = Array.isArray(seenOrOptions) ? { seen: seenOrOptions } : (seenOrOptions || {});
  const seen = options.seen || [];
  const answers = options.answers || [];
  const bad = [];
  const words = wordCount(question);
  if (words > MAX_QUESTION_WORDS) bad.push(`${words} words, max ${MAX_QUESTION_WORDS}`);
  if (ASIDE.test(question)) bad.push("carries an aside, which is a second idea without a second question mark");
  if (PRESUPPOSES_ACTION.test(question)) {
    bad.push(`presupposes they did it: "${question.match(PRESUPPOSES_ACTION)[0]}" - ask what happened instead`);
  }
  const introduced = introducedWords(question, answers);
  if (introduced.length > MAX_INTRODUCED_WORDS) {
    bad.push(`introduces ${introduced.length} words they never used: ${introduced.join(", ")}`);
  }
  const marks = (question.match(/\?/g) || []).length;
  if (marks !== 1) bad.push(`${marks} question marks, must be exactly 1`);
  if (sentenceCount(question) > 2) bad.push(`${sentenceCount(question)} sentences, max 2`);
  if (RESEARCH_WORDS.test(question)) bad.push(`mentions the research: "${question.match(RESEARCH_WORDS)[0]}"`);
  if (ADVICE_PHRASES.test(question)) bad.push(`gives advice: "${question.match(ADVICE_PHRASES)[0]}"`);
  if (ASSERTION_PHRASES.test(question)) bad.push(`states a conclusion: "${question.match(ASSERTION_PHRASES)[0]}"`);
  if (BOLTED_ON_CLOSED.test(question)) bad.push(`two questions in one: "${question.match(BOLTED_ON_CLOSED)[0]}"`);
  if (OPENS_CLOSED.test(question)) bad.push(`answerable yes or no: opens "${question.match(OPENS_CLOSED)[0].trim()}"`);
  else if (CLOSED_ALTERNATIVES.test(question)) bad.push("either/or: closed, with two doors instead of one");
  for (const secret of secrets) {
    if (question.toLowerCase().includes(secret.toLowerCase())) bad.push(`repeats confidential detail: "${secret}"`);
  }
  if (seen.includes(question)) bad.push("repeats an earlier question word for word");
  return bad;
}
