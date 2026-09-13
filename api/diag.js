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

import { BASE_URL, REQUEST_TIMEOUT_MS } from "./_provider.js";
import { kvEnabled, LIMITS } from "./_limits.js";

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
      endpoint: `${BASE_URL}/v1/messages`,
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

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the single word: ok" }]
      })
    });
    const body = await upstream.text();
    out.probe = {
      httpStatus: upstream.status,
      elapsedMs: Date.now() - started,
      body: body.slice(0, 800)
    };

    if (upstream.status === 401) out.problems.push("401: the provider rejected the key.");
    else if (upstream.status === 402) out.problems.push("402: no credit on the OpenRouter account, or the key's credit limit is spent.");
    else if (upstream.status === 404) out.problems.push(`404: the endpoint or the model slug "${model}" was not found. Check the slug on openrouter.ai/models.`);
    else if (upstream.status === 400) out.problems.push("400: the provider rejected the request shape for this model. Try an anthropic/ slug: some models are not served over the Anthropic-compatible endpoint.");
    else if (upstream.status === 429) out.problems.push("429: rate limited by the provider.");
    else if (upstream.status >= 500) out.problems.push(`${upstream.status}: provider-side error.`);
    else if (upstream.ok) out.problems.push("None. The provider answered normally, so the model call itself works.");
  } catch (error) {
    out.probe = {
      elapsedMs: Date.now() - started,
      failed: error?.name === "AbortError"
        ? `No answer within ${REQUEST_TIMEOUT_MS}ms`
        : `${error?.name}: ${error?.message}`
    };
    out.problems.push(
      error?.name === "AbortError"
        ? "The model did not answer in time. Either this model is too slow for the function's duration limit, or the endpoint is not responding. Try a faster model, or raise REQUEST_TIMEOUT_MS if your plan allows a longer function."
        : "Could not reach the provider at all. Check OPENROUTER_BASE_URL if you set one."
    );
  } finally {
    clearTimeout(timer);
  }

  return res.status(200).json(out);
}
