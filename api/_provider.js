// Where the model calls go. Shared by ask.js and diag.js so they can never
// disagree about the URL.

// The Anthropic SDK appends "/v1/messages" itself, so the base must stop
// short of it. Accept the endpoint as written in OpenRouter's docs too: a
// base ending in "/v1" or "/v1/messages" is trimmed back rather than doubled.
export function normaliseBase(url) {
  return url.replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "");
}

export const BASE_URL = normaliseBase(
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api"
);

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
  return process.env.OPENROUTER_ENDPOINT === "chat" ? "chat" : "messages";
}
