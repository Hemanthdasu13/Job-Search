// The closing selection. One model call, at the end of a conversation, whose
// entire output is a list of ids from a fixed library and a quote of the
// person's own words for each.
//
// Why this is a separate endpoint rather than another field on /api/ask:
//
// 1. The questioner must never see the library. If the card list were in the
//    questioner's prompt, a question could start carrying the research —
//    "did you consider that silence is not safety?" — and the one rule this
//    tool is built on would be broken by a leak nobody would notice for
//    weeks. The questioner cannot leak what it was never shown.
//
// 2. Selecting is not questioning. Two prompts each doing one job beat one
//    prompt doing both badly, and the question quality is the product.
//
// 3. It is separately testable, and separately failable. If this call dies,
//    the conversation still closes: the page falls back to the fixed text it
//    used before this screen existed.
//
// The model cannot state a finding here, because the schema has nowhere to
// put one. It picks ids. The words a visitor reads are the visitor's own,
// plus text written by the researcher and shipped in the HTML.

import { claimModelCall, bumpCounter } from "./_limits.js";
import { modelApiKey } from "./_provider.js";
import { callModel, describeFailure, describeReply, extractJson, jsonSchema, textOf } from "./_model.js";
import { PRACTICE_IDS, MAX_SELECTED, triggerList, validateSelection, isPracticeId, isVerbatim, normaliseForMatch } from "./_practices.js";
import { MAX_STRENGTHS, STRENGTH_IDS, triggerList as heldTriggerList, validateHeld, heldOnlySystem, isStrengthId } from "./_strengths.js";
import { verifyToken, tokenFrom, spendKeyCall } from "./_access.js";
import { VERSION } from "./_version.js";

const MAX_ANSWERS = 12;
// Matched to ask.js, which is the only place these numbers can come from: the
// questioner accepts 2000 characters an answer and 20000 a conversation, so
// anything tighter here refuses a conversation the rest of the tool has
// already had. It did. At 1500 and 9000, one long answer - and the textarea
// allows 2000 - or five ordinary ones from a verbose person returned
// bad_request_shape, which drops the whole ledger and shows the general
// closing instead. ask.js carried exactly this bug and had it fixed; the
// closing kept it, because nobody checked that the two agreed.
const MAX_ANSWER_CHARS = 2000;
const MAX_TOTAL_CHARS = 20000;
const MAX_EVIDENCE_CHARS = 300;

// How long this handler may take in total, and the least amount of time worth
// starting the second pass with.
//
// vercel.json gives this function thirty seconds. One live closing spent
// 20004ms on the first call and timed out; had it instead returned slowly,
// the second pass would have started with ten seconds of ceiling left and
// been killed by the platform mid-call - which loses the first pass's valid
// answer too, because nothing has been written to the response yet. Three
// seconds of headroom under the ceiling, and a second pass only when there is
// real time for one.
const BUDGET_MS = 27000;
const MIN_SECOND_PASS_MS = 5000;

// And how long the first call may take.
//
// The client's own deadline is 20 seconds, set for the questioner, where the
// visitor is watching a spinner and a slow question is worse than none. Here
// the visitor is already reading a complete closing screen: the ledger
// replaces it when it arrives and nothing on the page is waiting. One live
// closing spent 20004ms and was cut off four milliseconds past the deadline,
// losing the whole ledger to save a visitor a wait they were not having.
// So this call gets most of the function's ceiling instead.
const FIRST_PASS_MS = 24000;

// The evidence is the visitor's own sentence, shown back to them. A hard
// character slice cuts it mid-word, and a mangled version of your own words
// reads as the tool having misheard you - on the one screen where being
// quoted accurately is the entire point. Cut at a word boundary and mark the
// cut, or do not cut at all.
function clipEvidence(text) {
  if (text.length <= MAX_EVIDENCE_CHARS) return text;
  const cut = text.slice(0, MAX_EVIDENCE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  // No space worth cutting at means it is not prose; leave it rather than
  // trimming the quote down to nothing.
  const kept = lastSpace > MAX_EVIDENCE_CHARS / 2 ? cut.slice(0, lastSpace) : cut;
  return kept.replace(/[\s,;:.\u2014-]+$/, "") + "\u2026";
}

export const SELECT_SYSTEM = `You are given someone's account of a time they used AI in a real piece of
work, as it was collected: what they typed first, then each question they were
asked and what they answered. Your only job is to choose which of the listed
items did not come up in what they said, and to quote the words of theirs that
show it.

Read every answer as the answer to the question above it. The same words mean
opposite things depending on what was asked, and this is the commonest way to
get it wrong. Asked what a plan had assumed about her fitness that she had not
told it, someone answered "the kind of machines available, my actual fitness
levels, my prior workout plan". That is a list of what she did NOT give it. On
its own it reads as a list of what she DID give it, and reading it that way
puts the opposite of the truth on her screen.

So when an answer names things, check what the question asked for. A list
offered in answer to what was missing, not given, not told, not checked or not
known is evidence for the first list below, never the second.

You never write an explanation, a finding, an assessment, a score, advice, or
any sentence of your own. You never describe the person. You choose ids and
you copy their words.

The items that did not come up:
${triggerList()}

The items that DID come up. These are the same kind of thing read the other
way: something the account positively shows, not something missing from it.
${heldTriggerList()}

Choosing:
- Choose at most ${MAX_SELECTED}. Fewer is better. Two precise beats three
  where one is a stretch.
- Order them by which matters most in this account, most first.
- Choose an item only if the account gives you a quotable line that shows it.
  If nothing they said shows it, do not choose it, however likely it seems.
- The line must show the item as the item is written, not a related idea in
  the same area. Read the item's wording again and check the line against
  that wording, not against the topic. An item about a second answer being
  treated as corroboration is not shown by a line about using the tool twice
  for different jobs. Where the line shows something adjacent rather than the
  item itself, that is a different item or no item.
- Judge only what they described. A thing they did not mention is not a thing
  they did not do, so choose on the strength of the words in front of you and
  nothing else.
- If they described a specific, independent, constructed check that already
  covers the case, choose nothing. An empty list is a valid and often correct
  answer.
- Weigh what being wrong would have cost before choosing anything. Where they
  say what the downside was, and the downside is small, and the checking they
  describe is in proportion to it, choose nothing from the first list. Someone
  who says the worst case is a slightly worse laptop has priced the decision
  and spent about the right effort on it. A gap named there is not a finding,
  it is a lecture, and the person reading it stops believing the screen for
  the decision that actually mattered. Proportion is the judgement; a short
  account of a small decision handled lightly is a correct empty list, not a
  thin one.
- If the account is too thin to show anything, choose nothing.

Quoting:
- Quote only from an "Answered" line, or from what they described first. The
  questions are not theirs; a question quoted back as their own words is the
  tool putting words in their mouth.
- Each quote must be a span copied character for character from what they
  wrote. Do not correct spelling, do not tidy grammar, do not shorten with an
  ellipsis, do not join two separate phrases.
- Twelve characters minimum. Long enough to be recognisably theirs.
- Never quote a client name, a price, a volume or an internal figure. If the
  only line that would show an item contains one, choose a different span or
  do not choose that item.

Choosing what did come up:
- Choose at most ${MAX_STRENGTHS} from the second list. Fewer is better, and
  none is a legitimate answer.
- The same rules apply. A quotable line has to show it, the line has to show
  that item rather than something nearby, and judge only what they described.
- Never quote the same sentence for both lists. If one line is all you have,
  it belongs to the first list, and the second list is empty.
- Do not reach for one of these to soften the list above. Choosing a strength
  that is a stretch is worse than choosing none, because a person reading
  something generous their own words do not support stops believing the rest
  of the screen.
- Being shy is its own failure, though, and the commoner one. Where a line
  plainly shows one of these, name it. Someone who says they asked a local
  who had been there has shown a second source that saw something the model
  did not; someone who says "that's AI reasoning, I wouldn't know" has named
  what the system could not have known. Both are in the list. Neither needs
  to be impressive to be true, and an account that shows one and gets nothing
  back reads as a tool that only knows how to find fault.

What being wrong would have cost:
- If they say what the downside was, copy the span where they say it. Their
  words, same rules as every other quote, and nothing if they never said.
- It is the sentence that makes the rest of the screen mean something. A gap
  in a five year supplier contract and a gap in a gym plan are the same card
  on the page until the cost is sitting next to them, and they are the only
  one who can say which this is.
- The cost to them, not your reading of it. If they said a wrong figure would
  have gone to a funder deciding a renewal, that is the span. If they said the
  worst case is a slightly worse laptop, that is also the span, and it is just
  as useful: it is what tells the reader the screen is not lecturing them.
- Not a near miss. A line about the decision being important in general is not
  a line about what being wrong would have cost.

Output format. Reply with one JSON object and nothing else: no prose before or
after it, no markdown, no code fence. Three keys: two lists of objects, each
object an id from the matching list above and the quote, and one string:
{"gaps": [{"id": "an id from the first list", "quote": "their exact words"}],
 "held": [{"id": "an id from the second list", "quote": "their exact words"}],
 "stake": "their exact words about what being wrong would have cost"}
Every id must be copied exactly from the lists above. Do not write an id of
your own, and do not put an id from one list into the other. To choose
nothing for either, give an empty list, and give "stake" as an empty string
if they never said what it would have cost.`;

// The ids, enforced by the provider rather than asked for in prose.
//
// This is the fix for the fault that emptied the ledger. Across four live
// conversations the selector chose nine items and the server threw away
// every one of them as "not in the library": three, three, two, one. The
// screen fell back to the general closing each time and the log said nothing
// about why, because only the reason was logged and not the id. The
// questioner has answered under an enforced schema since 0.4.0; the selector
// never did, so the one call whose entire output is a list of ids from a
// fixed list was the one call free to invent them.
//
// A list of objects rather than a list of ids plus a map, because an enum
// cannot be put on the keys of a map. The shape change is why readReply
// below accepts both.
const quotedPick = (ids) => ({
  type: "array",
  items: jsonSchema(
    { id: { type: "string", enum: [...ids] }, quote: { type: "string" } },
    ["id", "quote"]
  )
});
export const SELECT_FORMAT = jsonSchema(
  { gaps: quotedPick(PRACTICE_IDS), held: quotedPick(STRENGTH_IDS),
    stake: { type: "string" } }, ["gaps", "held", "stake"]);
export const HELD_FORMAT = jsonSchema({ held: quotedPick(STRENGTH_IDS) }, ["held"]);

// Either shape, in the one the validators already take.
//
// The schema asks for {gaps:[{id,quote}]}. A provider that rejects the schema
// falls back to the prompt asking for JSON, and an older reply shape may
// still arrive, so both are read. Nothing here judges an id; that is the
// validators' job and theirs alone.
export function readReply(raw) {
  const out = { selected: [], evidence: {}, held: [], held_evidence: {}, stake: "" };
  if (!raw || typeof raw !== "object") return out;

  const take = (list, ids, evidence) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" ? item.id : null;
      if (!id) continue;
      ids.push(id);
      const quote = item.quote ?? item.evidence;
      // First quote wins. A list can carry one id twice with two different
      // quotes, where the map this flattens into cannot, and last-wins means
      // a fabricated quote paired with a real one under the same id passes on
      // the real one. The prompt asks for the list ordered by what matters
      // most, so the first is the choice the model actually made; the second
      // is rejected as a duplicate either way.
      if (typeof quote === "string" && !(id in evidence)) evidence[id] = quote;
    }
  };
  take(raw.gaps, out.selected, out.evidence);
  take(raw.held, out.held, out.held_evidence);
  if (typeof raw.stake === "string") out.stake = raw.stake;

  // The older shape: parallel arrays of ids and maps of quotes.
  if (Array.isArray(raw.selected)) {
    for (const id of raw.selected) if (typeof id === "string") out.selected.push(id);
    if (raw.evidence && typeof raw.evidence === "object") Object.assign(out.evidence, raw.evidence);
  }
  if (Array.isArray(raw.held) && raw.held.some((h) => typeof h === "string")) {
    for (const id of raw.held) if (typeof id === "string") out.held.push(id);
    if (raw.held_evidence && typeof raw.held_evidence === "object") {
      Object.assign(out.held_evidence, raw.held_evidence);
    }
  }
  return out;
}

// A real id filed under the wrong list is moved, not thrown away.
//
// The two lists are deliberately "the same kind of thing read the other way",
// so the selector crossing them is the predictable mistake, and both
// validators report a crossed id as "not in the library" - identical in the
// log to an invented one. Discarding it loses a judgement the model got
// right: it found the thing and put it on the wrong side. The destination
// library decides which side that is, so nothing unearned reaches the screen.
export function routeByLibrary(reply) {
  const out = { selected: [], evidence: {}, held: [], held_evidence: {},
                stake: reply.stake || "" };
  let moved = 0;
  const place = (id, quote, home) => {
    const isGap = isPracticeId(id);
    const isHeld = isStrengthId(id);
    const target = isGap ? "selected" : isHeld ? "held" : home;
    if (target !== home && (isGap || isHeld)) moved += 1;
    out[target].push(id);
    if (typeof quote === "string") {
      out[target === "selected" ? "evidence" : "held_evidence"][id] = quote;
    }
  };
  for (const id of reply.selected) place(id, reply.evidence[id], "selected");
  for (const id of reply.held) place(id, reply.held_evidence[id], "held");
  return { reply: out, moved };
}

const BUILD = `${VERSION}@${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}`;

// A failure here is not an error on the page. The page has a fixed closing it
// has always been able to fall back to, so this answers 200 with an empty
// selection and the reason rides along for ?debug=1.
const fall = (res, reason) => {
  res.setHeader("X-Fallback-Reason", reason);
  return res.status(200).json({ ok: false, reason, build: BUILD, selected: [] });
};

// Both the stubbed and the real path answer through here, so a stubbed walk
// exercises the clipping, the field names and the ordering that production
// uses. A stub answering in its own shape is a stub that lets a rendering
// bug through, which is the one thing it exists to prevent.
const answer = (res, build, kept, rejected, held = [], heldRejected = [], stake = "") =>
  res.status(200).json({
    ok: true,
    build,
    selected: kept.map(({ id, evidence }) => ({ id, evidence: clipEvidence(evidence) })),
    held: held.map(({ id, evidence }) => ({ id, evidence: clipEvidence(evidence) })),
    stake: stake ? clipEvidence(stake) : "",
    rejected: rejected.concat(heldRejected).map(({ id, why }) => ({ id, why })),
    library: PRACTICE_IDS.length + STRENGTH_IDS.length
  });

// Verbatim or nothing, same rule as every other span on this screen. This one
// is set in quotation marks directly under "What you said was at stake", so a
// tidied-up version would be the tool telling someone what they said their own
// risk was, on the line whose only authority is that they said it.
export function readStake(raw, answers, verbatim) {
  const span = typeof raw?.stake === "string" ? raw.stake.trim() : "";
  if (!span) return "";
  if (!verbatim(span, answers)) {
    console.error("close_stake_rejected", "not the person's own words");
    return "";
  }
  return span;
}

// The same sentence cannot be the evidence for both sides of the ledger.
//
// Every validator passes when it happens: the quote is verbatim, both ids are
// real, both triggers are arguably met. It still reads as a machine that
// found one quotable line and used it twice, which is exactly the suspicion
// the screen is trying not to confirm. A strength loses, not a gap: the gap
// is the thing there is something to do about.
function dropSharedEvidence(held, kept, stake = "") {
  const spent = new Set(kept.map((k) => normaliseForMatch(k.evidence)));
  // The stake joins the same rule. A stubbed walk put "picking the wrong
  // supplier locks us into five years of higher cost" on the screen twice,
  // once under "what you said was at stake" and again as the quote under a
  // strength, and the repetition is the whole screen's credibility: it reads
  // as a machine that found one quotable line and used it everywhere.
  //
  // A strength loses, as it already does against a gap. Where the only line
  // that would evidence a strength is the line about what being wrong would
  // have cost, the strength was a stretch anyway, and the stake is the thing
  // that tells a contract from a gym plan.
  if (stake) spent.add(normaliseForMatch(stake));
  const out = { kept: [], rejected: held.rejected.slice() };
  for (const item of held.kept) {
    if (spent.has(normaliseForMatch(item.evidence))) {
      out.rejected.push({ id: item.id, why: "same quote as a selected gap" });
      continue;
    }
    out.kept.push(item);
  }
  return out;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // no Origin header on a same-origin POST from some clients
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return extractJson(req.body);
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000) return null;
    }
    return extractJson(raw);
  } catch {
    return null;
  }
}

function readAnswers(body) {
  const answers = body?.answers;
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > MAX_ANSWERS) return null;
  if (!answers.every((a) => typeof a === "string" && a.trim())) return null;

  // Clipped and trimmed rather than refused. A refusal here costs the person
  // the entire closing screen, which is a worse answer to "you wrote a lot"
  // than a selection made from most of what they wrote. Each answer is cut to
  // the per-answer limit first, then the middle of the conversation goes if
  // the total is still over - the opening account and the last turns are the
  // ones carrying the quotable lines.
  const clipped = answers.map((a) => a.trim().slice(0, MAX_ANSWER_CHARS));
  const total = (list) => list.reduce((n, a) => n + a.length, 0);
  if (total(clipped) <= MAX_TOTAL_CHARS) return clipped;

  const head = clipped.slice(0, 1);
  const tail = clipped.slice(-2);
  const middle = clipped.slice(1, -2);
  const kept = [...head];
  let room = MAX_TOTAL_CHARS - total(head) - total(tail);
  for (const answer of middle) {
    if (answer.length > room) continue;
    kept.push(answer);
    room -= answer.length;
  }
  kept.push(...tail);
  console.error("close_answers_trimmed", `${answers.length} to ${kept.length}`);
  return total(kept) <= MAX_TOTAL_CHARS ? kept : [...head, ...tail].map((a) => a.slice(0, MAX_TOTAL_CHARS / 3));
}

// The questions, so an answer can be read as the answer to something.
//
// The selector used to be sent the answers alone. A visitor was asked what
// the plan had assumed about her fitness that she had not told it, and
// answered "The kind of machines available, my actual fitness levels, my work
// out plan prior to AI making one" - a list of what she had WITHHELD. On its
// own that line reads as a list of what she had SPECIFIED, and the selector
// read it that way: it put "scope was part of the instruction" on her screen,
// which is the exact inverse of what happened, and left the matching gap
// unchosen.
//
// The questioner, which had the questions, got it right in the same
// conversation: its summary said "without giving it my actual fitness level".
// Same words, two readings, and the only difference was the question.
//
// Optional, because a conversation from an older page will not send them and
// a closing is better than no closing.
const MAX_QUESTION_CHARS = 400;

function readQuestions(body) {
  const questions = body?.questions;
  if (!Array.isArray(questions)) return [];
  return questions
    .filter((q) => typeof q === "string" && q.trim())
    .slice(0, MAX_ANSWERS)
    .map((q) => q.trim().slice(0, MAX_QUESTION_CHARS));
}

// The conversation as it happened. The first answer is the account they typed
// unprompted; after that each answer belongs to the question above it.
//
// Labelled so the quoting rule can be stated against the labels: a span may
// only be copied from an "Answered" line. Nothing stops that structurally
// either - the verbatim check runs against the answers alone - but the model
// should not be asked to obey a rule it cannot see the shape of.
export function transcriptOf(answers, questions = []) {
  const lines = answers.map((answer, i) => {
    if (i === 0) return `[1] What they described, before being asked anything:\n${answer}`;
    const question = questions[i - 1];
    return question
      ? `[${i + 1}] Asked: ${question}\nAnswered: ${answer}`
      : `[${i + 1}] Answered: ${answer}`;
  });
  return lines.join("\n\n");
}

// Deterministic stand-in for the model, so the closing screen, the card
// rendering and the fallback can all be walked without spending a call.
// #none forces the empty selection; #bogus forces a reply the validator has
// to reject, which is the path least likely to be exercised by accident and
// most likely to be wrong.
function stubbedSelection(answers) {
  const joined = answers.join(" ").toLowerCase();
  if (joined.includes("#none")) return { selected: [], evidence: {} };
  if (joined.includes("#bogus")) {
    return {
      gaps: [{ id: "not-a-real-card", quote: "words nobody typed here" }],
      held: [{ id: "not-a-real-strength", quote: "nor these" }]
    };
  }
  // A real id on the wrong side, so a stubbed walk exercises the router that
  // rescued the crossed ids four live conversations threw away.
  if (joined.includes("#crossed")) {
    const span = answers.slice().sort((a, b) => b.length - a.length)[0];
    return { gaps: [{ id: "source-outside-the-model", quote: span }], held: [] };
  }
  // Quote the longest thing they said, which is at least certain to be theirs.
  const span = answers.slice().sort((a, b) => b.length - a.length)[0];
  // The last answer as the stake: the conversation usually arrives at what
  // being wrong would have cost near the end, and a stubbed walk has to render
  // that block or nobody sees it until it is live.
  const stake = answers.length > 1 ? answers[answers.length - 1] : "";
  // One card whose research has been written and one whose has not, so a
  // single stubbed walk exercises both the rendering and the gate that keeps
  // an unwritten card off the screen.
  return {
    gaps: [
      { id: "constructed-check", quote: span },
      { id: "reliance-not-trust", quote: span }
    ],
    // The second-longest, so a stubbed walk shows two different sentences and
    // the dedupe rule is exercised by #bogus rather than by every walk.
    held: [{
      id: "named-the-unknowable",
      quote: answers.slice().sort((a, b) => b.length - a.length)[1] || span
    }],
    stake
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return fall(res, "method_not_post");
  if (!sameOrigin(req)) return fall(res, "cross_origin");

  const body = await readJsonBody(req);
  const answers = readAnswers(body);
  if (!answers) return fall(res, "bad_request_shape");

  // Before anything that costs money or reveals configuration. A gate the
  // page enforces is decoration; this is the one that counts, because this
  // is what a script posting straight to the endpoint has to get past.
  const access = verifyToken(tokenFrom(req));
  if (!access.ok) return fall(res, access.reason);

  if (new URL(req.url, "http://localhost").searchParams.get("stub") === "1") {
    const routed = routeByLibrary(readReply(stubbedSelection(answers))).reply;
    const { kept, rejected } = validateSelection(routed, answers);
    const stubStake = readStake(routed, answers, isVerbatim);
    const held = dropSharedEvidence(validateHeld(routed, answers, isVerbatim), kept, stubStake);
    return answer(res, BUILD + "+stub", kept, rejected, held.kept, held.rejected, stubStake);
  }

  const key = modelApiKey();
  const model = process.env.MODEL_ID;
  if (!key) return fall(res, "no_api_key");
  if (!model) return fall(res, "no_model_id");

  // The key's own allowance, spent before the shared budget. A key good for
  // one conversation runs out here rather than by the visitor being polite.
  const spend = await spendKeyCall(access, bumpCounter);
  if (!spend.allowed) return fall(res, spend.reason);

  const claim = await claimModelCall(req);
  if (!claim.allowed) return fall(res, claim.reason);

  const transcript = [{ role: "user", content: transcriptOf(answers, readQuestions(body)) }];

  let response;
  const started = Date.now();
  try {
    // No caching: this prompt is sent once per conversation, and a cache
    // write costs more than the read it would never get.
    response = await callModel(key, model, SELECT_SYSTEM, transcript,
      undefined, { cacheSystem: false, format: SELECT_FORMAT, timeoutMs: FIRST_PASS_MS });
  } catch (error) {
    const reason = describeFailure(error, model, Date.now() - started);
    console.error("close_call_failed", reason, model, Date.now() - started + "ms");
    return fall(res, reason);
  }

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    return fall(res, "unusable_" + response.stop_reason);
  }

  const text = textOf(response);
  const parsed = extractJson(text);
  if (!parsed || (!Array.isArray(parsed.gaps) && !Array.isArray(parsed.selected))) {
    // Shape only, same rule as the questioner: the selector's reply quotes
    // the visitor's own sentences back as evidence, so the words stay out of
    // the log. An empty closing is survivable; an undiagnosable one is not.
    console.error("close_call_unparseable", model, describeReply(response, text, ["gaps", "selected", "id", "quote"]));
    return fall(res, "unparseable_reply");
  }

  const { reply, moved } = routeByLibrary(readReply(parsed));
  if (moved) console.error("close_ids_rerouted", moved + " from the wrong list");
  const { kept, rejected } = validateSelection(reply, answers);
  const stake = readStake(reply, answers, isVerbatim);
  const held = dropSharedEvidence(validateHeld(reply, answers, isVerbatim), kept, stake);

  // An empty result is a legitimate answer, not a failure: it is what a
  // well-run piece of work should produce. But an empty result caused by the
  // model inventing ids or quotes is a different thing, and the page's owner
  // needs to be able to tell them apart.
  // Empty on both lists is the worst screen the tool can produce, and the
  // measured cause is the model under-reading the second list rather than the
  // account being empty. So it gets one more look, at the strengths alone.
  const leftOnTheClock = BUDGET_MS - (Date.now() - started);
  if (!kept.length && !held.kept.length && leftOnTheClock >= MIN_SECOND_PASS_MS) {
    try {
      const again = await callModel(key, model, heldOnlySystem(), transcript,
        undefined, { cacheSystem: false, format: HELD_FORMAT, timeoutMs: leftOnTheClock });
      const reparsed = routeByLibrary(readReply(extractJson(textOf(again)))).reply;
      const second = validateHeld(reparsed, answers, isVerbatim);
      console.error("close_held_second_pass", second.kept.length ? "found " + second.kept.length : "still none");
      if (second.kept.length) {
        const deduped = dropSharedEvidence(second, kept, stake);
        held.kept = deduped.kept;
        held.rejected = held.rejected.concat(deduped.rejected);
      }
    } catch (error) {
      // The first pass already answered. A failed second look costs the
      // visitor nothing and must not turn a closing screen into an error.
      console.error("close_held_second_pass_failed", describeFailure(error, model, 0));
    }
  }

  if (!kept.length && !held.kept.length && leftOnTheClock < MIN_SECOND_PASS_MS) {
    console.error("close_held_second_pass_skipped", leftOnTheClock + "ms left");
  }

  // The id as well as the reason. Four live conversations logged nine items
  // rejected as "not in the library" and there was no way to tell an invented
  // id from a real one filed under the wrong list - which is the difference
  // between a prompt problem and a routing problem, and they have opposite
  // fixes. These ids are the researcher's own vocabulary, not the visitor's
  // words, so logging them keeps the privacy rule intact.
  if (rejected.length || held.rejected.length) {
    console.error("close_selection_rejected", model,
      JSON.stringify(rejected.concat(held.rejected).map((r) => `${r.id}: ${r.why}`)));
  }

  return answer(res, BUILD, kept, rejected, held.kept, held.rejected, stake);
}
