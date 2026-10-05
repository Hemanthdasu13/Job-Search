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

export const MAX_QUESTION_WORDS = 20;

export function wordCount(text) {
  return (String(text).trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

// What the handler refuses and asks again for. Deliberately a short list: a
// regeneration costs a provider call, so only the faults that reliably ruin
// the turn are worth one. Length and asides make a question hard to read;
// these three make it produce the wrong answer.
export function hardFault(question) {
  const q = String(question || "");
  if (PRESUPPOSES_ACTION.test(q)) {
    return `presupposes an action they may not have taken: "${q.match(PRESUPPOSES_ACTION)[0]}"`;
  }
  if (OPENS_CLOSED.test(q)) return "answerable yes or no";
  if (BOLTED_ON_CLOSED.test(q)) return "two questions in one";
  if (SUGGESTS_ANSWER.test(q)) {
    return `supplies the answer: "${q.match(SUGGESTS_ANSWER)[0].slice(0, 48)}"`;
  }
  if (wordCount(q) > MAX_QUESTION_WORDS + 6) return `${wordCount(q)} words`;
  return null;
}
