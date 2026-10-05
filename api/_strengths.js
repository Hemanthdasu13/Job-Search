// The closed set of strengths the closing screen can name.
//
// The mirror of _practices.js, and it exists for a reason that came out of a
// real conversation rather than out of symmetry. Every one of the seventeen
// practice cards names something MISSING, so every path through the closing
// ended in a gap - and a tool that finds a gap in a Soho pub recommendation
// is a tool that finds a gap in everything, which is the one failure that
// costs it the readers it is written for.
//
// There is also a mechanism behind it, not just a courtesy. Lee et al. (CHI
// 2025, 319 knowledge workers) found confidence in the AI predicted LESS
// critical thinking while confidence in one's own ability predicted MORE. On
// that finding, naming what someone did well is the part that raises the
// chance they check next time. A closing that only names gaps works against
// its own purpose. That finding shaped this file and appears nowhere on the
// page: other people's work decides the architecture, the research on the
// page stays the researcher's own.
//
// Same division of labour as the practices. This file holds ids and trigger
// conditions and no research text. The sentence a visitor reads lives in
// public/index.html, written by the researcher, because the rule this tool
// is built on is that every research claim is text a person wrote. A
// strength with an empty `why` is never rendered, exactly as with a practice,
// so the slots can exist here before the words exist there.
//
// A trigger describes what AN ACCOUNT SHOWS, never what kind of person they
// are. "They consulted a primary document" is a statement about one described
// decision. "They are careful" would be a classification, which this tool
// does not do in either direction - praise is a classification too, and the
// temptation to hand one out is stronger on this side of the ledger than on
// the other.

export const STRENGTHS = {
  "source-outside-the-model": {
    trigger: "Something the model could not have produced was consulted: a primary document, an authoritative record, or a person who would know."
  },
  "said-what-to-exclude": {
    trigger: "They describe what they ruled out as well as what they asked for - a scope, an entity, an exception, a distinction the answer had to preserve."
  },
  "check-that-could-fail": {
    trigger: "A check was built and run that would have come out differently if the output had been wrong."
  },
  "named-the-unknowable": {
    trigger: "They state something the system had no way of knowing, as a limit on what the output can be relied on for."
  },
  "independent-knowledge": {
    trigger: "A person was consulted whose knowledge does not come from the same material the model saw."
  },
  "effort-matched-to-stakes": {
    trigger: "How much checking to do was decided by what being wrong would have cost, and they say what that cost was."
  },
  "chased-the-doubt": {
    trigger: "Something looked off and they followed it until it resolved, rather than setting it aside."
  },
  "path-can-be-walked": {
    trigger: "Someone else could reach the same result from the same inputs, because the route from one to the other is recorded."
  },
  "judgement-stayed-theirs": {
    trigger: "The system assembled material and a person made the call, with the call identifiable as that person's."
  }
};

export const STRENGTH_IDS = Object.freeze(Object.keys(STRENGTHS));

// Two, not three. The gaps side shows up to three because a gap is work to
// do; a strength is work already done, and a third one starts to read as
// flattery. Deliberately lower than MAX_SELECTED so the two sides can never
// come out as a balanced three-and-three, which a reader scores whatever the
// page intends.
export const MAX_STRENGTHS = 2;

export function isStrengthId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(STRENGTHS, id);
}

export function triggerList() {
  return STRENGTH_IDS.map((id) => `- ${id}: ${STRENGTHS[id].trigger}`).join("\n");
}

// Same validator as the gaps, pointed at this library. A strength has to be
// evidenced by the person's own words exactly as a gap does - more so, if
// anything. A gap named on a paraphrase is a wrong diagnosis; a strength
// named on a paraphrase is flattery the tool invented, and flattery is the
// fastest way to be dismissed by the reader who was already suspicious.
export function validateHeld(raw, answers, isVerbatim) {
  const selected = Array.isArray(raw?.held) ? raw.held : [];
  const evidence = raw?.held_evidence && typeof raw.held_evidence === "object" ? raw.held_evidence : {};
  const kept = [];
  const rejected = [];
  const seen = new Set();

  for (const id of selected) {
    if (!isStrengthId(id)) { rejected.push({ id: String(id).slice(0, 40), why: "not in the library" }); continue; }
    if (seen.has(id)) { rejected.push({ id, why: "duplicate" }); continue; }
    if (kept.length >= MAX_STRENGTHS) { rejected.push({ id, why: "past the ceiling of " + MAX_STRENGTHS }); continue; }
    const span = evidence[id];
    if (!isVerbatim(span, answers)) { rejected.push({ id, why: "quote is not the person's own words" }); continue; }
    seen.add(id);
    kept.push({ id, evidence: String(span).trim() });
  }
  return { kept, rejected };
}

// Asked once more, with only the second list, when the first pass came back
// empty on both.
//
// Why a second call rather than a firmer instruction. Opus and Sonnet were
// given this exact prompt on the same account - a Soho recommendation checked
// with a local. Both returned an empty gap list, which was the right answer.
// Opus returned two strengths on quotes sitting in plain sight in the man's
// own words; Sonnet returned none. So the prompt is followable and the
// shortfall is calibration, which another paragraph of encouragement does not
// fix. It had already been told that being shy is its own failure.
//
// It is also the one case worth paying for. Empty on both lists is exactly
// when the page falls through to the general closing, and that is how a
// pension-model story ended up answering a question about a pub. One extra
// call, only on the worst outcome, with the seventeen gap items and forty
// lines of gap instruction removed so the nine strengths are the whole task
// rather than an appendix to it.
export function heldOnlySystem() {
  return `You are given someone's account of a time they used AI in a real piece of
work. Your only job is to choose which of the listed items the account
positively shows, and to quote the words of theirs that show it.

You never write an explanation, a finding, an assessment, a score, advice, or
any sentence of your own. You never describe the person. You choose ids and
you copy their words.

The items:
${triggerList()}

Choosing:
- At most ${MAX_STRENGTHS}. None is a legitimate answer if the account really
  shows none.
- Choose an item only if a quotable line shows it, and shows that item rather
  than something nearby.
- Judge only what they described.
- Nothing has to be impressive to be true. A person who asked someone who had
  been there has consulted a source whose knowledge did not come from the
  model. A person who says they would not know where a claim came from has
  named what the system could not have known. Both count.

Quoting:
- Copied character for character from what they wrote. Do not correct
  spelling, do not tidy grammar, do not shorten with an ellipsis, do not join
  two separate phrases.
- Twelve characters minimum.
- Never quote a client name, a price, a volume or an internal figure.

Output format. Reply with one JSON object and nothing else: no prose before or
after it, no markdown, no code fence. Exactly two keys:
{"held": ["id"], "held_evidence": {"id": "their exact words"}}
To choose nothing, reply {"held": [], "held_evidence": {}}.`;
}
