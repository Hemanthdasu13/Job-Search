// The closed set of practices the closing screen can name.
//
// This file holds ids and trigger conditions. It deliberately holds no
// research text: the finding, the wording and the participant quote live in
// public/index.html, because the rule this tool is built on is that every
// research claim is text a person wrote, not text a model produced. The
// model's entire job at the close is to pick ids out of this list and quote
// the visitor back to themselves. It cannot write a claim, because the schema
// it answers in has nowhere to put one.
//
// The ids come from the design intents in the Bucket B and Bucket C scenario
// set. Seventeen of them, each appearing as either the gap a scenario is
// built to surface or the false positive a clean scenario is built to bait.
//
// A trigger describes what is MISSING FROM AN ACCOUNT, not what is wrong with
// a person. That distinction is the whole licence for this screen to exist:
// naming what did not come up in six answers is a statement about one
// described decision, and is reversible by the next sentence the person says.
// Naming what kind of person they are would be a classification, which this
// tool does not do, has never done, and must not start doing because the
// closing got more ambitious.

export const PRACTICES = {
  "reliance-not-trust": {
    trigger: "The output fed a decision, a deliverable, or someone else's action, whatever the person says about how much they trusted it."
  },
  "independent-source-check": {
    trigger: "Nothing outside the model's own output was consulted: no primary document, no authoritative record, no person who would know."
  },
  "constrain-the-generation": {
    trigger: "They describe what they asked for but not what they ruled out: no scope, no entity, no exceptions, no distinctions the answer had to preserve."
  },
  "constructed-check": {
    trigger: "Acceptance rested on the output reading as correct rather than on a check that was built and run against it."
  },
  "named-triggers": {
    trigger: "No rule decided in advance said that this kind of claim, or this level of stakes, must be verified before it moves."
  },
  "silence-is-not-safety": {
    trigger: "The absence of a warning, a flag or an adverse finding was read as reassurance."
  },
  "two-failure-modes": {
    trigger: "Only one direction of error was weighed. The cost of the opposite mistake was never named."
  },
  "borrowed-rule": {
    trigger: "The output matched something they already believed, and that fit is what made it credible."
  },
  "gut-feel-signal": {
    trigger: "Something felt off, was noticed, and was set aside without being chased."
  },
  "interaction-audit": {
    trigger: "What was asked, which version of the source was used, or who reviewed it cannot now be reconstructed."
  },
  "domain-goes-silent": {
    trigger: "The claim sat outside what the reviewer knows well enough to judge, and no one who did know saw it."
  },
  "reproduction-gap": {
    trigger: "No one else could arrive at the same result from the same inputs, because the path from one to the other was never visible."
  },
  "manufactured-divergence": {
    trigger: "A second model, or the same model asked again, was treated as corroboration although it saw the same material."
  },
  "speed-not-advantage": {
    trigger: "Speed was the benefit, and it came from leaving a control out rather than from having a control ready to reuse."
  },
  "junior-heuristic": {
    trigger: "An informal rule of thumb was reproduced by the system and inherited its authority without ever being tested."
  },
  "examiner-not-originator": {
    trigger: "The model issued the judgement, the score or the recommendation, rather than assembling material for someone who then judged."
  },
  "structural-not-instructional": {
    trigger: "What was needed was a gate in the process about who must look, not a better sentence in the prompt."
  }
};

export const PRACTICE_IDS = Object.freeze(Object.keys(PRACTICES));

// At most three. A closing that names seven things is a report card, which is
// the failure mode this screen is one bad decision away from at all times.
export const MAX_SELECTED = 3;

export function isPracticeId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(PRACTICES, id);
}

// What the selector is allowed to choose from, rendered for the prompt. Built
// from the same object the validator uses, so the model can never be offered
// an id the server would then reject, and cannot be un-offered one it would
// accept.
export function triggerList() {
  return PRACTICE_IDS.map((id) => `- ${id}: ${PRACTICES[id].trigger}`).join("\n");
}

// Evidence has to be the person's own words, and "own words" has to mean
// something a machine can refuse. Normalising whitespace and case is as far
// as this goes: it forgives a copy that lost a line break, and nothing else.
// A paraphrase, a tidied-up version, a sentence the model found more elegant
// — all rejected, because the moment the quote drifts, the screen is telling
// the person what they said instead of showing them.
export function normaliseForMatch(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isVerbatim(span, answers) {
  const needle = normaliseForMatch(span);
  if (needle.length < 12) return false; // too short to be evidence of anything
  const haystack = normaliseForMatch(answers.join(" \u0000 "));
  return haystack.includes(needle);
}

// Drops anything the model should not have sent: an id that is not in the
// library, a duplicate, a card past the ceiling, or a quote the person did
// not actually type. Returns only what survives, in the order given, because
// the order is the model's one legitimate judgement call: which gap matters
// most in this account.
export function validateSelection(raw, answers) {
  const selected = Array.isArray(raw?.selected) ? raw.selected : [];
  const evidence = raw?.evidence && typeof raw.evidence === "object" ? raw.evidence : {};
  const kept = [];
  const rejected = [];
  const seen = new Set();

  for (const id of selected) {
    if (!isPracticeId(id)) { rejected.push({ id: String(id).slice(0, 40), why: "not in the library" }); continue; }
    if (seen.has(id)) { rejected.push({ id, why: "duplicate" }); continue; }
    if (kept.length >= MAX_SELECTED) { rejected.push({ id, why: "past the ceiling of " + MAX_SELECTED }); continue; }
    const span = evidence[id];
    if (!isVerbatim(span, answers)) { rejected.push({ id, why: "quote is not the person's own words" }); continue; }
    seen.add(id);
    // Store the span as the person typed it, not as normalised for matching:
    // the screen shows their sentence, not a lowercased version of it.
    kept.push({ id, evidence: String(span).trim() });
  }
  return { kept, rejected };
}
