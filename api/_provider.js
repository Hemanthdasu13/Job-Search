// Where the model calls go. Shared by ask.js and diag.js so they can never
// disagree about the URL.

// The Anthropic SDK appends "/v1/messages" itself, so the base must stop
// short of it. Accept the endpoint as written in OpenRouter's docs too: a
// base ending in "/v1" or "/v1/messages" is trimmed back rather than doubled.
export function normaliseBase(url) {
  return url.replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "");
}

export const BASE_URL = normaliseBase(
  process.env.PROVIDER_BASE_URL ||
  process.env.OPENROUTER_BASE_URL ||
  "https://openrouter.ai/api"
);

// The key is just "the key", whatever provider it belongs to. Putting a
// Google key in a variable called OPENROUTER_API_KEY works but reads as a
// mistake, so the provider-neutral name is preferred and the old one still
// answers, because renaming a variable should not require a redeploy to
// discover.
export function modelApiKey() {
  return process.env.MODEL_API_KEY || process.env.OPENROUTER_API_KEY || "";
}

// Which provider the base URL points at, for the few checks that are
// provider-specific rather than shape-specific.
export function isOpenRouter() {
  // Sniffing the host covers the normal case. The override exists for a
  // gateway or proxy in front of OpenRouter, where the host says nothing
  // about who is behind it.
  if (process.env.PROVIDER_IS_OPENROUTER === "1") return true;
  if (process.env.PROVIDER_IS_OPENROUTER === "0") return false;
  return /(^|\.)openrouter\.ai/i.test(BASE_URL);
}

// Anthropic's own API authenticates with x-api-key; the compatible endpoints
// other providers expose in front of the same wire format authenticate with a
// bearer token. That is not a detail the SDK can guess, and getting it wrong
// looks exactly like a dead key, so it is decided here from the base URL and
// overridable for a gateway that sits in front of one and speaks the other.
export function isAnthropicDirect() {
  if (process.env.PROVIDER_AUTH === "x-api-key") return true;
  if (process.env.PROVIDER_AUTH === "bearer") return false;
  return /(^|\.)anthropic\.com$/i.test(new URL(BASE_URL).hostname);
}

// How hard the model should work. Anthropic's current models think before
// answering, and this task does not need much of it: one short question, or a
// list of ids. Left unset on a provider that has no such setting, where it is
// simply not sent.
export function effort() {
  return process.env.MODEL_EFFORT || "";
}

// Thinking happens inside the output budget, so a ceiling sized for the JSON
// alone starves the answer: the model spends the budget reasoning and stops
// before writing anything. That is the exact failure this tool shipped with
// on a reasoning model, reaching the page as "unavailable" with nothing to
// say why, so the default here is generous rather than tight.
export function maxOutputTokens() {
  const n = Number(process.env.MAX_OUTPUT_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

// A model call has to finish inside the platform's function limit, so this
// must stay below the maxDuration set in vercel.json. Being killed at the
// boundary produces no log line and no reason on screen, which is the one
// failure that cannot be diagnosed, so always fail first, by a margin.
//
// Twenty seconds is sized for free models, which are queued and throttled
// and routinely take ten or more. On a paid model two or three is normal and
// this ceiling is never reached.
const t = Number(process.env.REQUEST_TIMEOUT_MS);
export const REQUEST_TIMEOUT_MS = Number.isFinite(t) && t > 0 ? t : 20000;

// OpenRouter serves two shapes. "messages" is the Anthropic-compatible
// endpoint; "chat" is OpenRouter's own OpenAI-shaped one, which every model
// on the platform supports, including the free ones. Default stays
// "messages" as specified; OPENROUTER_ENDPOINT=chat switches without a code
// change if a model turns out not to be served over the compatible endpoint.
// Read per call, not once at import: a constant here is frozen for the life
// of the process, which makes the setting untestable and unswitchable
// locally, and hides that fact until someone tries.
export function endpointMode() {
  const mode = process.env.PROVIDER_ENDPOINT || process.env.OPENROUTER_ENDPOINT;
  return mode === "chat" ? "chat" : "messages";
}

// The OpenAI-shaped path is not specific to OpenRouter: Google, Groq, Together
// and others expose one, and they do not agree on where it lives. OpenRouter
// is at <base>/v1/chat/completions; Google's compatibility layer sits under a
// different prefix entirely. So allow the full URL to be given outright,
// which makes moving provider a change of environment variables rather than
// a change of code.
export function chatCompletionsUrl() {
  return process.env.CHAT_COMPLETIONS_URL || `${BASE_URL}/v1/chat/completions`;
}
