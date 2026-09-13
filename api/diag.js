// Temporary diagnostic. Answer to "why is the interactive part unavailable",
// which is otherwise invisible by design: the page swallows every failure on
// purpose, so there has to be one place that does not.
//
//   /api/diag            configuration only, no model call
//   /api/diag?probe=1    also makes one tiny real call and reports the raw
//                        response, which is what actually identifies the fault
//
// It never prints the key: only whether one is set, its length, and whether
// its prefix has the expected shape. Delete this file once the site works.
//
// Deliberately raw fetch rather than the SDK: the point is to see exactly
// what the provider returns, including the bodies the SDK would turn into an
// exception.

import { BASE_URL, REQUEST_TIMEOUT_MS, endpointMode } from "./_provider.js";
import { kvEnabled, LIMITS, claimModelCall } from "./_limits.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.MODEL_ID;

  // Vercel injects these into every deployment. They answer "is the code I
  // pushed the code that is running", which is otherwise guesswork.
  const deployment = {
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "unknown").slice(0, 7),
    commitMessage: (process.env.VERCEL_GIT_COMMIT_MESSAGE || "").split("\n")[0] || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    environment: process.env.VERCEL_ENV || "not on Vercel",
    url: process.env.VERCEL_URL || null
  };

  const out = {
    checkedAt: new Date().toISOString(),
    deployment,
    config: {
      OPENROUTER_API_KEY: key
        ? { set: true, length: key.length, startsWith_sk_or: key.startsWith("sk-or-") }
        : { set: false },
      MODEL_ID: model || null,
      endpointMode: endpointMode(),
      endpoint: `${BASE_URL}/v1/${endpointMode() === "chat" ? "chat/completions" : "messages"}`,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      sharedCounters: kvEnabled ? "upstash" : "in-memory only",
      limits: LIMITS,
      nodeVersion: process.version
    },
    problems: []
  };

  if (!key) out.problems.push("OPENROUTER_API_KEY is not set on this deployment. Add it in Vercel, then redeploy.");
  else if (!key.startsWith("sk-or-")) out.problems.push("OPENROUTER_API_KEY does not start with sk-or-. It may be the wrong key, or have a stray space or quote around it.");
  if (!model) out.problems.push("MODEL_ID is not set on this deployment. Add it in Vercel, then redeploy.");

  const url = new URL(req.url, "http://localhost");
  if (url.searchParams.get("probe") !== "1") {
    out.next = "Add ?probe=1 to this URL to make one real call and see what the provider says.";
    return res.status(200).json(out);
  }
  if (!key || !model) {
    out.next = "Fix the problems above before probing.";
    return res.status(200).json(out);
  }

  // The probe spends two real model calls, and this endpoint is public and
  // unauthenticated. Charge it against the same budget as the tool itself so
  // it cannot be used to burn credit.
  const claim = await claimModelCall(req);
  if (!claim.allowed) {
    out.problems.push(`Probe skipped: ${claim.reason}. It spends real calls, so it shares the tool's budget.`);
    return res.status(200).json(out);
  }

  // Probe both shapes, not just the configured one. If one answers and the
  // other does not, that is the whole diagnosis in a single visit.
  async function probe(path, body) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body)
      });
      const text = await upstream.text();
      return { httpStatus: upstream.status, elapsedMs: Date.now() - started, body: text.slice(0, 400) };
    } catch (error) {
      return {
        elapsedMs: Date.now() - started,
        failed: error?.name === "AbortError"
          ? `no answer within ${REQUEST_TIMEOUT_MS}ms`
          : `${error?.name}: ${error?.message}`
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const ask = [{ role: "user", content: "Reply with the single word: ok" }];
  out.probe = {
    messages: await probe("/v1/messages", { model, max_tokens: 16, messages: ask }),
    chat: await probe("/v1/chat/completions", { model, max_tokens: 16, messages: ask })
  };

  const describe = (name, r) => {
    if (r.failed) return `${name}: ${r.failed}`;
    if (r.httpStatus === 200) return `${name}: works`;
    const known = {
      400: "rejected the request shape for this model",
      401: "key rejected",
      402: "no credit on the account or the key's limit is spent",
      404: `endpoint or model slug "${model}" not found`,
      429: "rate limited by the provider"
    };
    return `${name}: ${r.httpStatus} ${known[r.httpStatus] || (r.httpStatus >= 500 ? "provider-side error" : "unexpected")}`;
  };
  out.problems.push(describe("messages endpoint", out.probe.messages));
  out.problems.push(describe("chat endpoint", out.probe.chat));

  const messagesOk = out.probe.messages.httpStatus === 200;
  const chatOk = out.probe.chat.httpStatus === 200;
  out.verdict =
    messagesOk ? "The configured endpoint works. If the page still fails, the fault is after the call."
    : chatOk ? "This model is not served over the Anthropic-compatible endpoint but works on OpenRouter's own. Set OPENROUTER_ENDPOINT=chat in Vercel and redeploy."
    : "Neither endpoint answered. The lines above say why.";

  return res.status(200).json(out);
}
