// The only model call in the tool.
//
// Calls OpenRouter's Anthropic-compatible Messages endpoint. The Anthropic
// SDK speaks that wire format, so it is pointed at OpenRouter's base URL and
// given a bearer token rather than an x-api-key.
//
// Required environment variables:
//   OPENROUTER_API_KEY   sent as "Authorization: Bearer <key>"
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
//   OPENROUTER_BASE_URL  default https://openrouter.ai/api
//   OPENROUTER_ENDPOINT  "messages" (default, Anthropic-compatible) or
//                        "chat" (OpenAI-shaped, which most providers offer)
//   CHAT_COMPLETIONS_URL full URL of an OpenAI-shaped endpoint, for a
//                        provider whose path differs. Setting this plus
//                        OPENROUTER_ENDPOINT=chat, MODEL_ID and the key moves
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

import Anthropic from "@anthropic-ai/sdk";
import { claimModelCall } from "./_limits.js";
import { BASE_URL, REQUEST_TIMEOUT_MS, endpointMode, chatCompletionsUrl } from "./_provider.js";
import { VERSION } from "./_version.js";

const STATUSES = ["probing", "reached", "verified", "unclear", "off_topic"];

export const SYSTEM = `You ask questions. You never explain, assess, advise, summarise or state
conclusions. You never mention the research, the study, or any finding.
Maximum two sentences. Exactly one question.

Your aim: find one specific thing the AI could not have known, and that the
person did not check, and get them to see it in their own words. Work from
what they wrote, never from general knowledge about their industry.

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

function attributionHeaders() {
  const headers = {};
  if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_APP_NAME) headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  return headers;
}

let client = null;

// Built on first use, so a missing key is a quiet fallback rather than a
// throw while the module loads.
function getClient(key) {
  if (!client) {
    client = new Anthropic({
      apiKey: null,        // no x-api-key: OpenRouter authenticates by bearer token
      authToken: key,
      baseURL: BASE_URL,
      defaultHeaders: attributionHeaders(),
      // No retry: a retry doubles the wait the visitor is already staring at,
      // and the second attempt would be killed by the platform anyway.
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS
    });
  }
  return client;
}

// Every failure looks identical to a visitor. The reason rides along so the
// owner can see it with ?debug=1, and so the platform log and the page agree.
// OpenRouter's own endpoint, shaped like OpenAI's. Returned in the same
// shape the Anthropic path produces so the caller does not branch twice.
async function callChat(key, model, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(chatCompletionsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...attributionHeaders()
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [{ role: "system", content: SYSTEM }, ...messages]
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = new Error(`chat completions ${res.status}: ${body.slice(0, 300)}`);
      error.status = res.status;
      throw error;
    }
    const body = await res.json();
    const choice = body?.choices?.[0];
    return {
      stop_reason: choice?.finish_reason === "length" ? "max_tokens" : "end_turn",
      content: [{ type: "text", text: choice?.message?.content || "" }]
    };
  } finally {
    clearTimeout(timer);
  }
}

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

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// OpenRouter passes the model's text through as-is and the swappable model
// may be a small one, so accept a fenced or padded object rather than
// discarding an otherwise good answer. Anything still unreadable falls back.
function extractJson(text) {
  if (!text) return null;
  const direct = safeParse(text.trim());
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = safeParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return safeParse(text.slice(start, end + 1));
  return null;
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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return fail(res, "method_not_post");
  if (!sameOrigin(req)) return fail(res, "cross_origin");

  const body = await readJsonBody(req);
  const messages = buildMessages(body);
  if (!messages) return fail(res, "bad_request_shape");

  // Costs nothing upstream, so it is neither budgeted nor metered.
  if (new URL(req.url, "http://localhost").searchParams.get("stub") === "1") {
    const reply = stubbedReply(body.answers);
    return res.status(200).json({ ok: true, build: BUILD + "+stub", ...reply });
  }

  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.MODEL_ID;
  if (!key) {
    console.error("config_missing OPENROUTER_API_KEY");
    return fail(res, "no_api_key");
  }
  if (!model) {
    console.error("config_missing MODEL_ID");
    return fail(res, "no_model_id");
  }

  const claim = await claimModelCall(req);
  if (!claim.allowed) {
    return fail(res, claim.reason);
  }

  let response;
  const started = Date.now();
  try {
    response = endpointMode() === "chat"
      ? await callChat(key, model, messages)
      : await getClient(key).messages.create({
          model,
          max_tokens: 800,
          system: SYSTEM,
          messages
        });
  } catch (error) {
    // Status and model only. The request body is never logged. A wrong or
    // retired MODEL_ID shows up here as a 400 or 404 naming the slug.
    // "Error" tells nobody anything. Separate the case that matters most:
    // no answer in time, which is what a model too slow for the function's
    // limit looks like from in here.
    const timedOut = /timeout|timed out|aborted/i.test(
      String(error?.message) + String(error?.name)
    );
    const elapsed = Date.now() - started;
    const detail = `${error?.message || ""} ${JSON.stringify(error?.error || "")}`;
    let reason;
    if (error?.status === 429) {
      reason = /free-models-per-day|free_tier|per.?day/i.test(detail)
        // The count lives with the provider, keyed to the account. Nothing
        // about this deployment can change it.
        ? "upstream_429 daily free-model allowance spent, resets midnight UTC, redeploying cannot help"
        : "upstream_429 provider busy, retry in a minute";
    } else if (error?.status) {
      reason = "upstream_" + error.status;
    } else if (timedOut) {
      reason = `upstream_timeout after ${elapsed}ms on ${model}`;
    } else {
      reason = "upstream_" + (error?.name || "unknown");
    }
    console.error("model_call_failed", reason, model, Date.now() - started + "ms",
      String(error?.message || "").slice(0, 200));
    return fail(res, reason);
  }

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    console.error("model_call_unusable", response.stop_reason, model);
    return fail(res, "unusable_" + response.stop_reason);
  }

  const text = (response.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = extractJson(text);
  if (!parsed || typeof parsed.question !== "string" || !STATUSES.includes(parsed.status)) {
    console.error("model_call_unparseable", model);
    return fail(res, "unparseable_reply");
  }

  // reflection is only ever shown on the two screens that close on it, so
  // drop it anywhere else rather than trusting the model to have sent null.
  const closesWithReflection = parsed.status === "reached" || parsed.status === "verified";
  const text_or_null = (value, limit) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;

  return res.status(200).json({
    ok: true,
    build: BUILD,
    question: parsed.question.slice(0, MAX_QUESTION_CHARS),
    status: parsed.status,
    reflection: closesWithReflection ? text_or_null(parsed.reflection, MAX_REFLECTION_CHARS) : null,
    closing_note: text_or_null(parsed.closing_note, MAX_NOTE_CHARS)
  });
}
