// The constraints the brief actually states, in one place, so the live probe
// and the model comparison cannot disagree about what "obeying" means.

export const RESEARCH_WORDS = /\b(eighteen|sixteen|twelve|interviews?|the study|my research|participants?|respondents?|findings?)\b/i;
export const ADVICE_PHRASES = /\b(you should|I recommend|I'd suggest|I would suggest|my advice|it's worth|you ought to|make sure you|try to)\b/i;
export const ASSERTION_PHRASES = /\b(this (?:means|shows|suggests)|that (?:means|shows|suggests)|in fact|clearly,|the problem is)\b/i;

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
  for (const secret of secrets) {
    if (question.toLowerCase().includes(secret.toLowerCase())) bad.push(`repeats confidential detail: "${secret}"`);
  }
  if (seen.includes(question)) bad.push("repeats an earlier question word for word");
  return bad;
}
