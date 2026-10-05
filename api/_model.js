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

// Set once if the provider rejects a response schema, so the rest of this
// container's calls do not each pay to rediscover it.
let formatRejected = false;

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
async function callChat(key, model, system, messages, maxTokens, timeoutMs = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS);
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

// cacheSystem: whether this prompt will be sent again soon enough to be read
// back. Writing a cache entry costs about 1.25x, so caching a prompt used once
// is a loss, not a saving. The questioner sends the same prompt six or seven
// times in a conversation and wants it; the closing selector runs once and
// does not.
// A reply schema the provider enforces, rather than a paragraph at the end of
// the prompt asking nicely for JSON.
//
// This exists because of a day of logs. On most turns the model answered in
// plain prose - 130 to 160 characters, no braces, no keys at all - and the
// retry recovered it every time, at the cost of a second call on the majority
// of turns. Constraining the format removes the failure instead of paying
// twice for it.
//
// Deliberately the most conservative schema that expresses the contract:
// every property required, no union or nullable types, one enum. A strict
// validator has nothing to object to. Fields that do not apply come back as
// an empty string, which the callers already read as absent.
export function jsonSchema(properties, required) {
  return { type: "object", properties, required, additionalProperties: false };
}

// A 400 naming the schema must not take the page down with it: the provider
// may be an older model, a compatible endpoint in front of one, or something
// that has never heard of the field.
function isFormatRefusal(error) {
  if (error?.status !== 400) return false;
  const detail = `${error?.message || ""} ${JSON.stringify(error?.error || "")}`;
  return /output_config|json_schema|schema|format/i.test(detail);
}

// timeoutMs: a shorter deadline than the client's, for a call that is not the
// only thing the visitor is waiting on. The closing selector's second pass
// runs after the first has already answered, inside one function invocation
// with a platform ceiling: two calls at the full client timeout exceed it,
// and being killed by the platform loses the first pass's valid result along
// with the second's. So the second call gets whatever time is left, not the
// whole allowance again.
export async function callModel(key, model, system, messages, maxTokens = maxOutputTokens(),
                                { cacheSystem = true, format = null, timeoutMs = 0 } = {}) {
  if (endpointMode() === "chat") {
    return callChat(key, model, system, messages, maxTokens, timeoutMs);
  }
  // The system prompt is identical on every call of a conversation and is the
  // largest single thing sent, so it is marked cacheable. Within one
  // conversation the turns are seconds apart, so calls two onwards read it
  // back at a tenth of the price instead of paying for it again.
  //
  // Caching is a prefix match and the minimum cacheable prefix is
  // model-dependent — 1024 tokens on Sonnet 5. Both prompts here sit just
  // above that, which is close enough that trimming one would silently stop
  // it caching with no error, only a bigger bill. A test holds the floor.
  const body = {
    model,
    max_tokens: maxTokens,
    system: cacheSystem
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system,
    messages
  };
  // Only sent when configured, so nothing here breaks a provider that has
  // never heard of it.
  const level = effort();
  const output = {};
  if (level) output.effort = level;
  if (format && !formatRejected) output.format = { type: "json_schema", schema: format };
  if (Object.keys(output).length) body.output_config = output;

  const options = timeoutMs > 0 ? { timeout: timeoutMs } : undefined;
  try {
    return await getClient(key).messages.create(body, options);
  } catch (error) {
    if (!body.output_config?.format || !isFormatRefusal(error)) throw error;
    // Once, then never again in this container. Falling back to the prompt
    // asking for JSON is exactly how this worked before the schema, so the
    // worst case is the behaviour it replaced rather than a dead page.
    formatRejected = true;
    console.error("output_format_unsupported", model, error?.status || "", String(error?.message || "").slice(0, 120));
    delete body.output_config.format;
    if (!Object.keys(body.output_config).length) delete body.output_config;
    return getClient(key).messages.create(body, options);
  }
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

// A reply that contains a usable question is worth recovering. The
// alternative is a dead conversation on the visitor's screen, and the
// question is sitting right there in the text.
//
// Each step below is a different shape a reply has actually arrived in,
// ordered by how much repair it does: a bare object, a fenced one, an object
// inside a sentence, two objects where one was asked for, one object with a
// trailing comma, one cut off partway through. Nothing here invents a field.
// Anything still unreadable falls back.
export function extractJson(text) {
  if (!text) return null;

  const direct = safeParse(text.trim());
  if (direct) return direct;

  // A fence, including one the reply was cut off inside: the closing ``` is
  // the first thing truncation takes, so it is not required here.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenced) {
    const inner = fenced[1].trim();
    const parsed = safeParse(inner) || safeParse(stripTrailingCommas(inner));
    if (parsed) return parsed;
  }

  // Every balanced object in the text, in order. This replaced a slice from
  // the first "{" to the last "}", which reads two objects as one piece of
  // broken JSON and swallows any stray brace in the prose around them.
  for (const candidate of balancedObjects(text)) {
    const parsed = safeParse(candidate) ||
                   safeParse(stripTrailingCommas(candidate)) ||
                   safeParse(escapeControlChars(candidate)) ||
                   safeParse(escapeControlChars(stripTrailingCommas(candidate)));
    if (parsed) return parsed;
  }

  // Nothing balanced at all, which is what a reply stopped mid-object looks
  // like. Lift out the fields that are complete and leave the rest to the
  // caller's defaults.
  return salvageFields(text);
}

// Tracks string state as it walks, so a brace inside a question - "what did
// it have in {} for that field" - does not close an object early.
function* balancedObjects(text) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        yield text.slice(start, i + 1);
        start = -1;
      }
    }
  }
}

// Raw control characters inside a string are invalid JSON and are what a
// model writing across two lines produces. Escaping them changes nothing
// about what the string says.
function escapeControlChars(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) { escaped = false; out += ch; continue; }
      if (ch === "\\") { escaped = true; out += ch; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

// A comma before a closing brace or bracket: legal in most of the languages
// the model has read and not in JSON, and the commonest single character
// that costs a whole otherwise-good object.
function stripTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

// The last resort, for an object that stops partway through. Only complete
// string values are taken: a question cut off mid-word is worse on screen
// than no question at all, so an unterminated one is left behind.
function salvageFields(text) {
  const out = {};
  for (const key of ["question", "status", "reflection", "closing_note"]) {
    const value = closedStringValue(text, key);
    if (value !== null) out[key] = value;
  }
  return out.question ? out : null;
}

function closedStringValue(text, key) {
  const at = text.indexOf(`"${key}"`);
  if (at === -1) return null;
  const colon = text.indexOf(":", at + key.length + 2);
  if (colon === -1) return null;
  let i = colon + 1;
  while (i < text.length && /\s/.test(text[i])) i++;
  const opener = text[i];
  // A typographic quote where JSON needs a straight one: invalid to the
  // parser, and the salvage is the last thing standing between that and a
  // dead conversation.
  if (opener !== '"' && opener !== "\u201c" && opener !== "\u201d") return null;
  const closer = opener === '"' ? '"' : "\u201d";
  let out = "";
  let escaped = false;
  for (i++; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      out += ch === "n" ? "\n" : ch === "t" ? "\t" : ch;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === closer || ch === '"') {
      return out.trim();
    } else {
      out += ch;
    }
  }
  return null; // unterminated
}

// What came back, in shape only. The one failure that needed diagnosing
// logged nothing but the model name, so the next occurrence had to be
// guessed at from four plausible causes.
//
// Shape only is not caution for its own sake: the reply carries a paraphrase
// of the visitor's own account in its reflection field, and nothing a
// visitor types is logged. A character count, a block list and which of four
// known key names are present breaks none of that. The words would.
const KNOWN_KEYS = ["question", "status", "reflection", "closing_note"];

function openerOf(body) {
  const m = body.match(/"question"\s*:\s*(.)/);
  if (!m) return "absent";
  const ch = m[1];
  if (ch === '"') return "quote";
  if (ch === "\u201c" || ch === "\u201d") return "curly_quote";
  if (ch === "'") return "apostrophe";
  if (ch === "{") return "object";
  if (ch === "[") return "array";
  if (ch === "n") return "maybe_null";
  return "other";
}

export function describeReply(response, text, keys = KNOWN_KEYS) {
  const blocks = (response?.content || []).map((b) => b.type).join("+") || "none";
  const body = text || "";
  const parts = [
    `blocks=${blocks}`,
    `stop=${response?.stop_reason || "none"}`,
    `chars=${body.length}`
  ];
  if (body) {
    const opens = (body.match(/{/g) || []).length;
    const closes = (body.match(/}/g) || []).length;
    parts.push(
      `starts=${/^\s*[{[]/.test(body) ? "brace" : /^\s*```/.test(body) ? "fence" : "prose"}`,
      `ends=${/[}\]]\s*$/.test(body) ? "brace" : /```\s*$/.test(body) ? "fence" : "open"}`,
      `braces=${opens}/${closes}`,
      // Only names the caller passed in are ever printed, so no substring
      // of the reply can reach the log by looking like a key.
      `keys=${keys.filter((k) => new RegExp(`"${k}"\\s*:`).test(body)).join(",") || "none"}`,
      // What the one field that matters opens on. A live failure had all four
      // keys, balanced braces, and still would not parse, and the shapes that
      // explain that - a typographic quote, a null, a nested object - are
      // indistinguishable from each other in everything above. Categorical,
      // so no character of the reply reaches the log.
      `qopen=${openerOf(body)}`
    );
  }
  return parts.join(" ");
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
