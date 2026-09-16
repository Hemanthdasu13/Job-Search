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
import { kvEnabled, kvSource, LIMITS, claimModelCall, peekUsage } from "./_limits.js";
import { SYSTEM } from "./ask.js";

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
      storage: kvEnabled
        ? `connected, credentials found in ${kvSource}`
        : "NOT connected: no Upstash credentials on this deployment",
      contributionsReadable: process.env.ADMIN_TOKEN
        ? "yes, with your ADMIN_TOKEN"
        : "no, ADMIN_TOKEN is not set",
      sharedCounters: kvEnabled ? "shared via Upstash" : "in-memory only, per instance",
      limits: LIMITS,
      nodeVersion: process.version
    },
    problems: []
  };

  if (!key) out.problems.push("OPENROUTER_API_KEY is not set on this deployment. Add it in Vercel, then redeploy.");
  else if (!key.startsWith("sk-or-")) out.problems.push("OPENROUTER_API_KEY does not start with sk-or-. It may be the wrong key, or have a stray space or quote around it.");
  if (!model) out.problems.push("MODEL_ID is not set on this deployment. Add it in Vercel, then redeploy.");
  if (!kvEnabled) out.problems.push("Upstash is not connected, so rate limits are per-instance and the contribute box will not appear. Add the two REST credentials in Vercel, then redeploy.");
  else if (!process.env.ADMIN_TOKEN) out.problems.push("Upstash is connected but ADMIN_TOKEN is not set, so contributed conversations cannot be read back.");

  // How much of the budget is already spent. Reading it costs nothing, and
  // "rate limited" is otherwise indistinguishable from "broken".
  const usage = await peekUsage(req);
  if (usage) {
    out.config.budgetUsed = usage;
    const [used, , cap] = usage.thisAddressThisWindow.split(" ");
    if (Number(used) >= Number(cap)) {
      out.problems.push(
        `This address has used its ${cap} calls for the current ${LIMITS.windowSeconds / 60}-minute window, ` +
        "so the tool will show its closing screen until the window rolls over. Not a fault."
      );
    }
  }

  // What the provider says this key is allowed, rather than what anyone
  // remembers the free tier to be. Costs no model call.
  if (key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}/v1/auth/key`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal
      });
      const body = await res.json().catch(() => null);
      const d = body && body.data;
      if (d) {
        out.providerAccount = {
          freeTier: d.is_free_tier,
          creditLimit: d.limit === null ? "no limit set" : d.limit,
          spent: d.usage,
          remaining: d.limit_remaining !== undefined ? d.limit_remaining
            : (d.limit === null ? "unlimited" : undefined),
          perKeyRateLimit: d.rate_limit || null
        };
        if (d.is_free_tier) {
          out.problems.push(
            "This key is on the provider's free tier. Free models share one small daily " +
            "allowance across the whole account, so a handful of conversations exhausts it " +
            "and every visitor after that sees the closing screen."
          );
        }
      } else {
        out.providerAccount = { error: `key lookup returned HTTP ${res.status}` };
      }
    } catch (error) {
      out.providerAccount = { error: `${error && error.name}: ${error && error.message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  const url = new URL(req.url, "http://localhost");
  const probeParam = url.searchParams.get("probe");
  if (probeParam !== "1" && probeParam !== "both") {
    out.next = "Add ?probe=1 for one real call to the configured endpoint, or ?probe=both to test the other one too, at the cost of one more call.";
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

  // One call by default. Probing both doubles what a diagnosis costs, and on
  // a small free allowance that matters. ?probe=both when the question is
  // specifically which endpoint serves this model.
  // Ask what the tool asks, with the ceiling the tool uses. A sixteen-token
  // probe truncates every model, so it could only ever report that the
  // endpoint accepted a request, which is not the question. The question is
  // whether this model can do this job.
  const ask = [{ role: "user", content: "A pricing analysis I ran with AI that went into a board pack." }];
  const both = probeParam === "both";
  const configured = endpointMode() === "chat" ? "chat" : "messages";
  const paths = { messages: "/v1/messages", chat: "/v1/chat/completions" };

  out.probe = {};
  for (const which of both ? ["messages", "chat"] : [configured]) {
    out.probe[which] = await probe(paths[which], which === "chat"
      ? { model, max_tokens: 800, messages: [{ role: "system", content: SYSTEM }, ...ask] }
      : { model, max_tokens: 800, system: SYSTEM, messages: ask });
  }
  out.probeCost = `${Object.keys(out.probe).length} provider call(s)`;

  // Judge the reply, not the status code.
  for (const r of Object.values(out.probe)) {
    if (r.httpStatus !== 200 || !r.body) continue;
    try {
      const parsed = JSON.parse(r.body);
      r.stopReason = parsed.stop_reason || parsed.choices?.[0]?.finish_reason || null;
      const text = (parsed.content || [])
        .filter((b) => b.type === "text").map((b) => b.text).join("") ||
        parsed.choices?.[0]?.message?.content || "";
      r.thoughtOutLoud = (parsed.content || []).some((b) => b.type === "thinking") ||
        /^(here'?s (my|a) (thinking|reasoning)|let me think|<think)/i.test(text.trim());
      const start = text.indexOf("{"), end = text.lastIndexOf("}");
      const obj = start !== -1 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
      r.usable = Boolean(obj && typeof obj.question === "string" && obj.status);
      r.reply = text.slice(0, 200);
    } catch {
      r.usable = false;
    }
  }

  const describe = (name, r) => {
    if (r.failed) return `${name}: ${r.failed}`;
    if (r.httpStatus === 200 && r.usable) return `${name}: works, and the reply is usable`;
    if (r.httpStatus === 200) {
      const why = r.stopReason === "max_tokens"
        ? "it ran out of tokens before finishing"
        : "the reply was not the required JSON";
      const thinking = r.thoughtOutLoud
        ? " This model writes its reasoning out loud, which spends the budget before the answer exists. Choose a model that is not a reasoning model."
        : "";
      return `${name}: answered, but unusably: ${why}.${thinking}`;
    }
    const known = {
      400: "rejected the request shape for this model",
      401: "key rejected",
      402: "no credit on the account or the key's limit is spent",
      404: `endpoint or model slug "${model}" not found`,
      429: "rate limited by the provider"
    };
    return `${name}: ${r.httpStatus} ${known[r.httpStatus] || (r.httpStatus >= 500 ? "provider-side error" : "unexpected")}`;
  };
  for (const [which, r] of Object.entries(out.probe)) {
    out.problems.push(describe(`${which} endpoint`, r));
  }

  const messagesOk = out.probe.messages && out.probe.messages.usable;
  const chatOk = out.probe.chat && out.probe.chat.usable;
  out.verdict =
    messagesOk ? "This model answers usably on the configured endpoint. If the page still fails, the fault is after the call."
    : chatOk ? "This model is not served over the Anthropic-compatible endpoint but works on OpenRouter's own. Set OPENROUTER_ENDPOINT=chat in Vercel and redeploy."
    : both
      ? "Neither endpoint answered. The lines above say why."
      : "The configured endpoint did not answer. Add ?probe=both to test the other one, at the cost of one more call.";

  return res.status(200).json(out);
}
