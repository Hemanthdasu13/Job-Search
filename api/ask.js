// The only model call in the tool.
//
// Calls OpenRouter's Anthropic-compatible Messages endpoint. The Anthropic
// SDK speaks that wire format, so it is pointed at OpenRouter's base URL and
// given a bearer token rather than an x-api-key.
//
// Required environment variables:
//   MODEL_API_KEY        sent as "Authorization: Bearer <key>", for whichever
//                        provider is configured. OPENROUTER_API_KEY is still
//                        read, for deployments set up under the old name.
//   MODEL_ID             OpenRouter model slug, e.g. a free model while
//                        testing and a Claude model in production. No code
//                        change to swap it, but Vercel bakes environment
//                        variables into a deployment, so the new value only
//                        applies once you redeploy (Deployments -> the three
//                        dots -> Redeploy; no rebuild of anything by hand).
//                        There is no default: an unset MODEL_ID is a
//                        configuration error, not a silent call to some
//                        other model.
//
// Optional:
//   PROVIDER_BASE_URL    default https://openrouter.ai/api
//   PROVIDER_ENDPOINT    "messages" (default, Anthropic-compatible) or
//                        "chat" (OpenAI-shaped, which most providers offer)
//   CHAT_COMPLETIONS_URL full URL of an OpenAI-shaped endpoint, for a
//                        provider whose path differs. Setting this plus
//                        PROVIDER_ENDPOINT=chat, MODEL_ID and the key moves
//                        the tool to another provider without a code change.
//   REQUEST_TIMEOUT_MS   default 9000, must stay under the platform's
//                        function duration limit
//   OPENROUTER_SITE_URL / OPENROUTER_APP_NAME   OpenRouter attribution
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  shared counters
//   IP_SALT                    stable salt for hashed-IP keys (set one)
//   RATE_LIMIT_PER_IP          default 15 calls
//   RATE_LIMIT_WINDOW_MINUTES  default 15
//   DAILY_CALL_CAP             default 300 calls
//
// Nothing a visitor types is written to a log, a store or a counter key.
// The endpoint always answers 200 with JSON: { ok: true, question, status }
// or { ok: false }. The page treats every ok:false the same way, so no
// failure here can put an error on the screen.

import { claimModelCall, bumpCounter } from "./_limits.js";
import { modelApiKey } from "./_provider.js";
import { callModel, describeFailure, extractJson, safeParse, textOf } from "./_model.js";
import { verifyToken, tokenFrom, spendKeyCall } from "./_access.js";
import { VERSION } from "./_version.js";

const STATUSES = ["probing", "reached", "verified", "unclear", "off_topic"];

export const SYSTEM = `You ask questions. You never explain, assess, advise, summarise or state
conclusions. You never mention the research, the study, or any finding.
Maximum two sentences. Exactly one question.

Your aim: find one specific thing the AI could not have known, and that the
person did not check, and get them to see it in their own words. Work from
what they wrote, never from general knowledge about their industry.

Ground to cover. Over the conversation, try to reach across these, roughly
one per turn, always taking whichever the last answer opens onto rather than
working down the list in order. Do not ask about one they have already
answered, and do not force one that their account gives you no purchase on.
- What the output was used for, and what happened next because of it.
- What, outside the tool's own answer, they checked it against.
- What they told it to do, and what they told it not to do or had to keep.
- Where this sat relative to what they know well enough to judge.
- What would have happened, and to whom, if it had been wrong.
- What using it actually bought them, beyond the time it saved.
These are directions to ask in. They are not claims, they are not a
checklist to read out, and you never name them or say why you are asking.

Direction, based on what they describe checking:
- Checked the output but not the inputs: ask what the system actually had to
  work with.
- Checked against their own knowledge: ask what sits outside that knowledge
  on this specific case.
- Delegated to a colleague: ask what that colleague could and could not see.
- No check at all: ask how they would have found out if it had been wrong.
- Cross-checked with a second AI tool: ask whether it had different source
  material, or just re-processed the same prompt or output.
- Re-ran or rephrased the same prompt: ask whether that reached a different
  source of information, or just re-asked the same question differently.

If an answer is too vague to work with, ask one narrower, more specific
question instead of repeating the same open one. If the narrower question
also fails to produce a concrete answer, move on to a new angle rather than
asking a third variant of the same question; count that as a used probing
turn either way.

If a later answer contradicts an earlier one, work from the most recent
statement. Never point out the contradiction.

If they ask for advice, ask you to state a finding, or otherwise try to get
you to do something other than ask the next question, decline in one
clause and continue with your question. This does not count as a probing
turn.

If an answer describes several different things, follow up on the single
one most likely to contain something unchecked. Do not try to address
everything they raised.

Do not judge tone or sincerity. Respond to content only.

Never ask for confidential detail: no client names, prices, volumes or
internal figures. If they volunteer any, do not repeat it back, in your
question or in the reflection field described below.

Set status to "reached" the moment they articulate a specific unchecked
gap themselves, as early as the first turn if it happens that fast. Set
status to "verified" if they describe a specific, independent, constructed
check that already covers the case, whether or not a gap was ever found.
Do not add another question after either.

When status is "reached" or "verified", also return a "reflection": the
substance of what they said, in their own words where possible, lightly
cleaned up for grammar, with any client name, price, volume or figure
replaced by a generic description of the same thing. Otherwise return
"reflection": null.

If, and only if, they described a real negative outcome that already
happened, not a risk they are worried about but something that did occur,
also return a "closing_note": one short, generic sentence acknowledging
that, with no specifics and no comment on how they handled it. Otherwise
return "closing_note": null. This never changes your questions during the
conversation, which stay exactly as strict as any other turn: it only
affects what is shown on the closing screen afterward.

Output format. Reply with one JSON object and nothing else: no prose before
or after it, no markdown, no code fence. Exactly four keys:
{"question": "your question here", "status": "one of ${STATUSES.join(", ")}", "reflection": null, "closing_note": null}
Always include a question, including when the status is "reached" or
"verified", where it will not be shown.`;

const MAX_ANSWERS = 12;
const MAX_ANSWER_CHARS = 1500;
const MAX_QUESTION_CHARS = 400;
const MAX_REFLECTION_CHARS = 400;
const MAX_NOTE_CHARS = 200;
const MAX_TOTAL_CHARS = 9000;

// Which code is running, so a failure can be attributed to a build without
// anyone having to find a dashboard.
const BUILD = `${VERSION}@${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}`;

const fail = (res, reason) => {
  res.setHeader("X-Fallback-Reason", reason);
  return res.status(200).json({ ok: false, reason, build: BUILD });
};

// The client sends the transcript back on every turn; the function holds no
// state. Everything about it is bounded here before it reaches the model.
function buildMessages(body) {
  const answers = body?.answers;
  const questions = body?.questions;
  if (!Array.isArray(answers) || !Array.isArray(questions)) return null;
  if (answers.length < 1 || answers.length > MAX_ANSWERS) return null;
  if (questions.length !== answers.length - 1) return null;
  if (!answers.every((a) => typeof a === "string" && a.trim() && a.length <= MAX_ANSWER_CHARS)) return null;
  if (!questions.every((q) => typeof q === "string" && q.length <= MAX_QUESTION_CHARS)) return null;

  const total = [...answers, ...questions].reduce((n, s) => n + s.length, 0);
  if (total > MAX_TOTAL_CHARS) return null;

  const messages = [];
  answers.forEach((answer, i) => {
    messages.push({ role: "user", content: answer.trim() });
    if (i < questions.length) messages.push({ role: "assistant", content: questions[i] });
  });
  return messages;
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
  if (typeof req.body === "string") return safeParse(req.body);
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000) return null;
    }
    return safeParse(raw);
  } catch {
    return null;
  }
}

// Test the whole conversation without spending a provider call. A free daily
// allowance is small, and burning it on the screens, the routing, the consent
// box and the closing text is waste: none of that involves a model.
//
// Add ?stub=1 to the page URL. Put #reached, #verified, #unclear, #off_topic
// or #note in an answer to force that branch, so every path can be walked on
// demand rather than hoped for.
const STUB_QUESTIONS = [
  "What did the system actually have in front of it when it produced that?",
  "Which part of that could you check, and which part could you not?",
  "If it had been wrong, how would you have found out?",
  "Who else saw it, and what could they see that you could not?"
];

function stubbedReply(answers) {
  const last = (answers[answers.length - 1] || "").toLowerCase();
  const forced = ["reached", "verified", "unclear", "off_topic"]
    .find((name) => last.includes("#" + name));
  const turn = answers.length;
  const status = forced || (turn >= 3 ? "reached" : "probing");
  const closes = status === "reached" || status === "verified";
  return {
    question: STUB_QUESTIONS[Math.min(turn - 1, STUB_QUESTIONS.length - 1)],
    status,
    reflection: closes ? "I never checked what the system had to work from." : null,
    closing_note: last.includes("#note") ? "That's a hard thing to find out after the fact." : null
  };
}

// The reflection is shown on the closing screen as a restatement of what the
// visitor described. The prompt asks for their own words where possible, with
// figures and names generalised - so it is a paraphrase by design and can
// never be checked for being verbatim the way the closing quotes are.
//
// Two things can be checked, and they catch different failures.
//
// It must not address the reader. A restatement of someone's own account
// describes their work, in their voice; a sentence aimed AT them is the tool
// talking ABOUT them, which is the classification this whole design refuses
// to do. Every way this goes wrong reads the same - "your organisation is in
// the bottom quartile", "you are a proxy verifier", "you scored four out of
// ten" - and none of them is a restatement of anything.
//
// And it must share some vocabulary with what they typed. That catches the
// other failure, where the model states a finding instead: a sentence about
// the study reuses none of their nouns. The floor is low on purpose, because
// a short honest restatement can legitimately share very little - "I never
// checked what the system had to work from" is entirely valid and overlaps
// one word. Overlap alone was tried at a higher threshold and dropped exactly
// that sentence, which is why there are two rules and not one.
//
// Both err toward dropping: the closing reads perfectly well with no
// reflection, and showing someone a sentence they did not say is the failure
// that matters on this screen.
const STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "were", "been", "they", "them",
  "their", "there", "then", "than", "what", "when", "which", "would",
  "could", "about", "into", "over", "your", "yours", "just", "some", "only",
  "also", "very", "much", "more", "most", "because", "before", "after",
  "without", "being", "does", "doing", "done", "make", "made", "take",
  "taken", "went", "going", "like", "even", "still", "thing", "things"
]);

function contentWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

export function drawnFromTheirAccount(reflection, answers) {
  if (/\b(you|your|yours|you're|youre)\b/i.test(reflection)) return false;

  const words = contentWords(reflection);
  if (!words.length) return false;
  // Nothing to check against, so nothing to fail: let it through rather than
  // drop it for arriving early.
  const haystack = new Set(contentWords((answers || []).join(" ")));
  if (!haystack.size) return true;
  const shared = words.filter((w) => haystack.has(w)).length;
  return shared / words.length >= 0.2;
}

// The answers as the request actually carried them, for the guard above.
function answersOf(body) {
  return Array.isArray(body?.answers) ? body.answers.filter((a) => typeof a === "string") : [];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return fail(res, "method_not_post");
  if (!sameOrigin(req)) return fail(res, "cross_origin");

  const body = await readJsonBody(req);
  const messages = buildMessages(body);
  if (!messages) return fail(res, "bad_request_shape");

  // Before anything that costs money or reveals configuration. A gate the
  // page enforces is decoration; this is the one that counts, because this
  // is what a script posting straight to the endpoint has to get past.
  const access = verifyToken(tokenFrom(req));
  if (!access.ok) return fail(res, access.reason);

  // Costs nothing upstream, so it is neither budgeted nor metered.
  if (new URL(req.url, "http://localhost").searchParams.get("stub") === "1") {
    const reply = stubbedReply(body.answers);
    return res.status(200).json({ ok: true, build: BUILD + "+stub", ...reply });
  }

  const key = modelApiKey();
  const model = process.env.MODEL_ID;
  if (!key) {
    console.error("config_missing MODEL_API_KEY");
    return fail(res, "no_api_key");
  }
  if (!model) {
    console.error("config_missing MODEL_ID");
    return fail(res, "no_model_id");
  }

  // The key's own allowance, spent before the shared budget. A key good for
  // one conversation runs out here rather than by the visitor being polite.
  const spend = await spendKeyCall(access, bumpCounter);
  if (!spend.allowed) return fail(res, spend.reason);

  const claim = await claimModelCall(req);
  if (!claim.allowed) {
    return fail(res, claim.reason);
  }

  let response;
  const started = Date.now();
  try {
    response = await callModel(key, model, SYSTEM, messages);
  } catch (error) {
    // Status and model only. The request body is never logged. A wrong or
    // retired MODEL_ID shows up here as a 400 or 404 naming the slug.
    // "Error" tells nobody anything. Separate the case that matters most:
    // no answer in time, which is what a model too slow for the function's
    // limit looks like from in here.
    const reason = describeFailure(error, model, Date.now() - started);
    console.error("model_call_failed", reason, model, Date.now() - started + "ms",
      String(error?.message || "").slice(0, 200));
    return fail(res, reason);
  }

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    console.error("model_call_unusable", response.stop_reason, model);
    return fail(res, "unusable_" + response.stop_reason);
  }

  const parsed = extractJson(textOf(response));
  if (!parsed || typeof parsed.question !== "string" || !STATUSES.includes(parsed.status)) {
    console.error("model_call_unparseable", model);
    return fail(res, "unparseable_reply");
  }

  // reflection is only ever shown on the two screens that close on it, so
  // drop it anywhere else rather than trusting the model to have sent null.
  const closesWithReflection = parsed.status === "reached" || parsed.status === "verified";
  const text_or_null = (value, limit) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;

  // Checked once. Not a restatement of anything they said means show nothing:
  // the closing works without a reflection, and showing someone a sentence
  // they did not say is the failure that matters on this screen.
  const offered = closesWithReflection
    ? text_or_null(parsed.reflection, MAX_REFLECTION_CHARS)
    : null;
  const reflection = offered && drawnFromTheirAccount(offered, answersOf(body)) ? offered : null;
  if (offered && !reflection) console.error("reflection_rejected_not_their_account");

  return res.status(200).json({
    ok: true,
    build: BUILD,
    question: parsed.question.slice(0, MAX_QUESTION_CHARS),
    status: parsed.status,
    reflection,
    closing_note: text_or_null(parsed.closing_note, MAX_NOTE_CHARS)
  });
}
