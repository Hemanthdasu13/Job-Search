// One model call, in whichever shape the configured provider serves.
//
// Lifted out of ask.js once there were two callers. The questioner and the
// closing selector must reach the provider by exactly the same path: if they
// drift, a provider swap fixes one and silently breaks the other, and the
// break shows up as "the interactive part is unavailable" with nothing to
// distinguish it from a dead key.

import Anthropic from "@anthropic-ai/sdk";
import { BASE_URL, REQUEST_TIMEOUT_MS, endpointMode, chatCompletionsUrl,
         isAnthropicDirect, effort, maxOutputTokens } from "./_provider.js";

export function attributionHeaders() {
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
    // The two headers are not interchangeable. Anthropic's own API reads
    // x-api-key and ignores a bearer token; the compatible endpoints in front
    // of the same wire format do the opposite. Sending the wrong one is a 401
    // that reads exactly like an invalid key, which is a day of looking in
    // the wrong place.
    const direct = isAnthropicDirect();
    client = new Anthropic({
      apiKey: direct ? key : null,
      authToken: direct ? null : key,
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

// The OpenAI-shaped path, returned in the same shape the Anthropic path
// produces so the caller does not branch twice.
async function callChat(key, model, system, messages, maxTokens) {
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
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, ...messages]
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

export async function callModel(key, model, system, messages, maxTokens = maxOutputTokens()) {
  if (endpointMode() === "chat") {
    return callChat(key, model, system, messages, maxTokens);
  }
  const body = { model, max_tokens: maxTokens, system, messages };
  // Only sent when configured, so nothing here breaks a provider that has
  // never heard of it.
  const level = effort();
  if (level) body.output_config = { effort: level };
  return getClient(key).messages.create(body);
}

// Every failure looks identical to a visitor, so the reason has to be named
// somewhere. Shared so that both callers describe the same fault identically.
export function describeFailure(error, model, elapsed) {
  const timedOut = /timeout|timed out|aborted/i.test(
    String(error?.message) + String(error?.name)
  );
  const detail = `${error?.message || ""} ${JSON.stringify(error?.error || "")}`;
  if (error?.status === 429) {
    return /free-models-per-day|free_tier|per.?day/i.test(detail)
      // The count lives with the provider, keyed to the account. Nothing
      // about this deployment can change it.
      ? "upstream_429 daily free-model allowance spent, resets midnight UTC, redeploying cannot help"
      : "upstream_429 provider busy, retry in a minute";
  }
  if (error?.status) return "upstream_" + error.status;
  if (timedOut) return `upstream_timeout after ${elapsed}ms on ${model}`;
  return "upstream_" + (error?.name || "unknown");
}

// The swappable model may be a small one, so accept a fenced or padded object
// rather than discarding an otherwise good answer. Anything still unreadable
// falls back.
export function extractJson(text) {
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

export function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function textOf(response) {
  return (response?.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
