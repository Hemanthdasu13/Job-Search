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

// A model call has to finish inside the platform's function limit, which is
// plan-dependent and can be as low as 10 seconds. Fail before that boundary
// rather than being killed at it: being killed produces no log line, which is
// exactly the case that is impossible to diagnose. Raise it with
// REQUEST_TIMEOUT_MS if the plan allows longer.
const t = Number(process.env.REQUEST_TIMEOUT_MS);
export const REQUEST_TIMEOUT_MS = Number.isFinite(t) && t > 0 ? t : 9000;
