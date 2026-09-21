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
import { callModel, describeFailure, extractJson, textOf } from "./_model.js";
import { PRACTICE_IDS, MAX_SELECTED, triggerList, validateSelection } from "./_practices.js";
import { verifyToken, tokenFrom, spendKeyCall } from "./_access.js";
import { VERSION } from "./_version.js";

const MAX_ANSWERS = 12;
const MAX_ANSWER_CHARS = 1500;
const MAX_TOTAL_CHARS = 9000;
const MAX_EVIDENCE_CHARS = 300;

export const SELECT_SYSTEM = `You are given someone's account of a time they used AI in a real piece of
work. Your only job is to choose which of the listed items did not come up
in what they said, and to quote the words of theirs that show it.

You never write an explanation, a finding, an assessment, a score, advice, or
any sentence of your own. You never describe the person. You choose ids and
you copy their words.

The items:
${triggerList()}

Choosing:
- Choose at most ${MAX_SELECTED}. Fewer is better. Two precise beats three
  where one is a stretch.
- Order them by which matters most in this account, most first.
- Choose an item only if the account gives you a quotable line that shows it.
  If nothing they said shows it, do not choose it, however likely it seems.
- Judge only what they described. A thing they did not mention is not a thing
  they did not do, so choose on the strength of the words in front of you and
  nothing else.
- If they described a specific, independent, constructed check that already
  covers the case, choose nothing. An empty list is a valid and often correct
  answer.
- If the account is too thin to show anything, choose nothing.

Quoting:
- Each quote must be a span copied character for character from what they
  wrote. Do not correct spelling, do not tidy grammar, do not shorten with an
  ellipsis, do not join two separate phrases.
- Twelve characters minimum. Long enough to be recognisably theirs.
- Never quote a client name, a price, a volume or an internal figure. If the
  only line that would show an item contains one, choose a different span or
  do not choose that item.

Output format. Reply with one JSON object and nothing else: no prose before or
after it, no markdown, no code fence. Exactly two keys:
{"selected": ["id", "id"], "evidence": {"id": "their exact words", "id": "their exact words"}}
Every id in "selected" must have an entry in "evidence". To choose nothing,
reply {"selected": [], "evidence": {}}.`;

const BUILD = `${VERSION}@${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}`;

// A failure here is not an error on the page. The page has a fixed closing it
// has always been able to fall back to, so this answers 200 with an empty
// selection and the reason rides along for ?debug=1.
const fall = (res, reason) => {
  res.setHeader("X-Fallback-Reason", reason);
  return res.status(200).json({ ok: false, reason, build: BUILD, selected: [] });
};

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
  if (!answers.every((a) => typeof a === "string" && a.trim() && a.length <= MAX_ANSWER_CHARS)) return null;
  if (answers.reduce((n, s) => n + s.length, 0) > MAX_TOTAL_CHARS) return null;
  return answers.map((a) => a.trim());
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
    return { selected: ["not-a-real-card"], evidence: { "not-a-real-card": "words nobody typed here" } };
  }
  // Quote the longest thing they said, which is at least certain to be theirs.
  const span = answers.slice().sort((a, b) => b.length - a.length)[0].slice(0, MAX_EVIDENCE_CHARS);
  // One card whose research has been written and one whose has not, so a
  // single stubbed walk exercises both the rendering and the gate that keeps
  // an unwritten card off the screen.
  return {
    selected: ["constructed-check", "reliance-not-trust"],
    evidence: { "constructed-check": span, "reliance-not-trust": span }
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
    const { kept, rejected } = validateSelection(stubbedSelection(answers), answers);
    return res.status(200).json({ ok: true, build: BUILD + "+stub", selected: kept, rejected });
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

  let response;
  const started = Date.now();
  try {
    response = await callModel(key, model, SELECT_SYSTEM, [
      { role: "user", content: answers.map((a, i) => `[${i + 1}] ${a}`).join("\n\n") }
    ]);
  } catch (error) {
    const reason = describeFailure(error, model, Date.now() - started);
    console.error("close_call_failed", reason, model, Date.now() - started + "ms");
    return fall(res, reason);
  }

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    return fall(res, "unusable_" + response.stop_reason);
  }

  const parsed = extractJson(textOf(response));
  if (!parsed || !Array.isArray(parsed.selected)) return fall(res, "unparseable_reply");

  const { kept, rejected } = validateSelection(parsed, answers);

  // An empty result is a legitimate answer, not a failure: it is what a
  // well-run piece of work should produce. But an empty result caused by the
  // model inventing ids or quotes is a different thing, and the page's owner
  // needs to be able to tell them apart.
  if (rejected.length) {
    console.error("close_selection_rejected", model, JSON.stringify(rejected.map((r) => r.why)));
  }

  return res.status(200).json({
    ok: true,
    build: BUILD,
    selected: kept.map(({ id, evidence }) => ({ id, evidence: evidence.slice(0, MAX_EVIDENCE_CHARS) })),
    rejected: rejected.map(({ id, why }) => ({ id, why })),
    library: PRACTICE_IDS.length
  });
}
