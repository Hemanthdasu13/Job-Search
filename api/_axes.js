// Which ground a question lands on.
//
// This exists because the prompt could not be trusted to keep count of its
// own questions, and asking it to was the same mistake three times over: a
// rule stated in the prompt that nothing in the system enforces. Measured
// over six real conversations, information was 48% of all questions asked,
// what would have happened if the output was wrong was asked once in
// twenty-five, and what it bought them never.
//
// The server already receives every question asked so far, so it can say
// what ground is covered as a fact rather than ask the model to audit
// itself. One copy, here, shared with scripts/coverage.mjs - a classifier
// mirrored in two places would drift, and this one decides what the model
// is told.
//
// Keyword matching, and crude on purpose. A question can land on two axes
// and counts for both; one it cannot place counts for none. The note it
// feeds is advisory - the model still has the whole transcript - so a
// mislabel costs a nudge in the wrong direction, not a wrong question.

export const AXES = {
  information: [
    /what (did )?(it|the (model|system|tool))( actually)? (had|have)/i,
    /what .*(it|system|model) (had|have) (about|to work|in front)/i,
    /versus what it (already )?assumed/i,
    /differs in structure or scale/i,
    /what you first checked/i,
    /did you (check|compare|verify|confirm)[^?]*(against|with)/i,
    /where did .* come from/i,
    /beyond what you gave it/i,
    /source(d|s)?\b/i, /\bmaterial\b/i, /\binputs?\b/i,
    /had no way of seeing/i, /wouldn't have seen/i, /couldn't see/i,
    /identical material/i, /same (brief|prompt|material|data)/i,
    /accurate|current|recent/i, /dataset|data set/i,
    // Added from twenty-eight questions this tool actually asked, of which
    // twenty-one landed on no axis at all - so the ground note read "none
    // placed" on nearly every turn and the one mechanism meant to stop it
    // repeating itself was telling it nothing. These are the shapes the live
    // questions take, not shapes imagined in advance.
    /\bassume[ds]?\b/i, /\bassumptions?\b/i, /\bassuming\b/i,
    /what (could|would|did) .*(have )?(known|know)\b/i,
    /\bin front of (it|him|her|them|you)\b/i,
    /\btreat(ed)? this as\b/i, /\bdrawn (straight )?from\b/i,
    /what .*(capture|captured|miss|missed)\b/i,
    /what .*(say|said) had changed/i,
    /what .*\b(extract|file|records?)\b.*\b(capture|miss|have|had)\b/i
  ],
  constraints: [
    /what did you (ask|tell) it to (include|use|do)/i,
    /tell it (not )?to leave out/i, /told it not to/i,
    /rule(d)? out/i, /instruct/i, /what did you ask it to use/i
  ],
  reliance: [
    /what (did you do|happened) (with|once|after)/i,
    /acted on/i, /went to/i, /applied that/i, /what it fed/i,
    /who (acted on|used) it/i, /differently because/i,
    /what (was|were) [^?]*\bused (for|in|on)\b/i,
    /what did you use [^?]*\bfor\b/i,
    /what happened (next|then|after|afterwards)/i,
    /\bonce (you|it|they) (had|gave|produced|ran)/i,
    /who (else )?(saw|read|reviewed|signed|approved|checked) it/i,
    /\bwent into\b/i, /\bended up\b/i, /\brested on\b/i
  ],
  domain: [
    /you already knew/i, /well enough to judge/i,
    /knowledge specific to/i, /outside (your|that) (own )?(domain|knowledge)/i,
    /could .* judge it/i, /guessing at/i, /\bexpertise\b/i
  ],
  consequence: [
    /what would happen (to|if)/i, /if it (had been|turned out|was) wrong/i,
    /who (would|was) (be )?affected/i, /\bat stake\b/i,
    /what would have followed/i, /and (for|to) whom/i,
    /what would (it )?(have )?(happen|happened|mean|meant)/i,
    /^if\b[^?]*\bwhat would\b/i,
    /who would (have )?(be|been|caught|rely|be relying)/i,
    /\bcaught short\b/i, /\bwalk (it )?back\b/i,
    /if [^?]*\b(had been|turned out|was|were|returned|arrived|moved|changed)\b[^?]*\bwrong\b/i,
    /\bwrongly (removed|flagged|included|excluded)\b/i
  ],
  advantage: [
    /what did (using )?it (actually )?(buy|give) you/i,
    /beyond the time/i, /saved you/i,
    /could not have (produced|done|got)/i, /\binstead of\b.*yourself/i
  ],
  detection: [
    /how (will|would) you (find out|know|catch)/i,
    /what would (alert|tell|warn) you/i,
    /catch an error/i, /before you acted/i, /need to see to catch/i,
    /came up that weren't/i, /still handles it correctly/i,
    /what checked whether/i, /without you noticing/i,
    /\bwould have (told|shown|alerted|warned) you\b/i,
    /what would have shown/i
  ]
};

// The six the prompt is steering across. detection is a seventh the
// questions keep landing on and the ground list does not name; it is
// classified so it shows up in the measurement, and left out of the note so
// the note only ever talks about ground the prompt actually asks for.
export const STEERED = ["information", "constraints", "reliance", "domain", "consequence", "advantage"];

export function classify(question) {
  const hits = [];
  for (const [axis, patterns] of Object.entries(AXES)) {
    if (patterns.some((p) => p.test(question))) hits.push(axis);
  }
  return hits;
}

export function tally(questions) {
  const counts = {};
  for (const q of questions || []) {
    for (const axis of classify(q)) counts[axis] = (counts[axis] || 0) + 1;
  }
  return counts;
}

// What the model is told, as counts rather than an instruction to count.
// Returns null on the first turn, where there is nothing to say yet.
export function coverageNote(questions) {
  const asked = (questions || []).filter((q) => typeof q === "string" && q.trim());
  if (!asked.length) return null;
  const counts = tally(asked);
  const done = STEERED.filter((a) => counts[a]).map((a) => `${a} ${counts[a]}`);
  const todo = STEERED.filter((a) => !counts[a]);
  // Only what is known exactly. How many questions have been asked is a
  // fact; how many are left is not, because a turn that produced nothing to
  // work from does not spend one, and the server cannot see which those
  // were. Stating an estimate as a fact is the mistake this whole tool is
  // about.
  const parts = [`this is question ${asked.length + 1}`];
  parts.push(`ground so far: ${done.length ? done.join(", ") : "none placed"}`);
  if (todo.length) parts.push(`not yet touched: ${todo.join(", ")}`);
  return `[Ground note, not part of the message above. ${parts.join(". ")}.]`;
}
