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

export function sentenceCount(text) {
  return text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
}

// Returns a list of the rules this question breaks. Empty means it obeyed.
export function violations(question, secrets = [], seen = []) {
  const bad = [];
  const marks = (question.match(/\?/g) || []).length;
  if (marks !== 1) bad.push(`${marks} question marks, must be exactly 1`);
  if (sentenceCount(question) > 2) bad.push(`${sentenceCount(question)} sentences, max 2`);
  if (RESEARCH_WORDS.test(question)) bad.push(`mentions the research: "${question.match(RESEARCH_WORDS)[0]}"`);
  if (ADVICE_PHRASES.test(question)) bad.push(`gives advice: "${question.match(ADVICE_PHRASES)[0]}"`);
  if (ASSERTION_PHRASES.test(question)) bad.push(`states a conclusion: "${question.match(ASSERTION_PHRASES)[0]}"`);
  if (BOLTED_ON_CLOSED.test(question)) bad.push(`two questions in one: "${question.match(BOLTED_ON_CLOSED)[0]}"`);
  if (OPENS_CLOSED.test(question)) bad.push(`answerable yes or no: opens "${question.match(OPENS_CLOSED)[0].trim()}"`);
  for (const secret of secrets) {
    if (question.toLowerCase().includes(secret.toLowerCase())) bad.push(`repeats confidential detail: "${secret}"`);
  }
  if (seen.includes(question)) bad.push("repeats an earlier question word for word");
  return bad;
}
