// Temporary diagnostic. Answer to "why is the interactive part unavailable",
// which is otherwise invisible by design: the page swallows every failure on
// purpose, so there has to be one place that does not.
//
//   /api/diag            configuration only, no model call
//   /api/diag?models=1   lists the models the configured key can reach, which
//                        is how MODEL_ID gets set without guessing
//   /api/diag?probe=1    also makes one tiny real call and reports the raw
//                        response, which is what actually identifies the fault
//
// It never prints the key: only whether one is set, its length, and whether
// its prefix has the expected shape. Delete this file once the site works.
//
// Deliberately raw fetch rather than the SDK: the point is to see exactly
// what the provider returns, including the bodies the SDK would turn into an
// exception.

import { BASE_URL, REQUEST_TIMEOUT_MS, endpointMode, chatCompletionsUrl, modelApiKey, isOpenRouter,
         isAnthropicDirect, effort, maxOutputTokens } from "./_provider.js";
import { kvEnabled, kvSource, LIMITS, claimModelCall, peekUsage } from "./_limits.js";
import { accessEnabled, accessHours } from "./_access.js";
import { timingSafeEqual } from "node:crypto";
import { SYSTEM } from "./ask.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const key = modelApiKey();
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
      apiKey: key
        // The first few characters identify the provider and are not secret:
        // Google's keys begin AIza, OpenRouter's sk-or. Enough to catch a key
        // pasted from the wrong place, without revealing anything.
        ? { set: true, length: key.length, prefix: key.slice(0, 4) + "..." }
        : { set: false },
      MODEL_ID: model || null,
      endpointMode: endpointMode(),
      auth: isAnthropicDirect() ? "x-api-key (Anthropic direct)" : "Authorization: Bearer",
      effort: effort() || "not set",
      maxOutputTokens: maxOutputTokens(),
      endpoint: endpointMode() === "chat" ? chatCompletionsUrl() : `${BASE_URL}/v1/messages`,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      storage: kvEnabled
        ? `connected, credentials found in ${kvSource}`
        : "NOT connected: no Upstash credentials on this deployment",
      contributionsReadable: process.env.ADMIN_TOKEN
        ? "yes, with your ADMIN_TOKEN"
        : "no, ADMIN_TOKEN is not set",
      sharedCounters: kvEnabled ? "shared via Upstash" : "in-memory only, per instance",
      limits: LIMITS,
      nodeVersion: process.version,
      access: accessEnabled()
        ? `by key: ${(process.env.ACCESS_PINS || "").split(",").filter(Boolean).length} issued, each good for ${accessHours()}h`
        : "open, no ACCESS_PINS set"
    },
    problems: []
  };

  if (!key) out.problems.push("MODEL_API_KEY is not set on this deployment. Add it in Vercel, then redeploy.");
  else if (/\s|["']/.test(key)) out.problems.push("The key contains a space or a quote character. Paste it without surrounding quotes.");
  else if (isOpenRouter() && !key.startsWith("sk-or-")) out.problems.push("The base URL points at OpenRouter but the key does not look like an OpenRouter key. Either the key or PROVIDER_BASE_URL is from a different provider.");
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
  if (key && isOpenRouter()) {
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

  if (accessEnabled()) {
    const pins = (process.env.ACCESS_PINS || "").split(",").map((e) => e.split(":")[0].trim()).filter(Boolean);
    const shortest = Math.min(...pins.map((p) => p.length));
    const attempts = Number(process.env.ACCESS_MAX_ATTEMPTS) || 10;
    // Guessing is bounded by the attempt limit, not by the length, so the
    // useful number is how long the limit makes a full sweep take.
    const days = Math.round((Math.pow(10, shortest) / 2) / (attempts * 24));
    if (days < 365) {
      out.problems.push(
        `Shortest key is ${shortest} characters. At ${attempts} attempts an hour, guessing it takes about ${days} days. ` +
        `Six digits or more makes that effectively never.`);
    }
    if (!kvEnabled) {
      out.problems.push(
        "Keys are configured but there is no shared store, so the attempt limit is per instance and someone guessing gets more tries than intended.");
    }
    if (pins.some((p) => /^(\d)\1+$|^123|^000/.test(p))) {
      out.problems.push("One of the keys is a guessable pattern. Use something without a run or a sequence in it.");
    }
  }

  const url = new URL(req.url, "http://localhost");
  const probeParam = url.searchParams.get("probe");

  // "Which models will this key actually serve?" MODEL_ID is the one setting
  // that cannot be checked by reading it: a wrong slug looks exactly like a
  // dead key until the call comes back. Listing costs no tokens on every
  // provider that offers it, so this is the cheap step before a probe, and it
  // ends the guess-redeploy-guess loop that a renamed model otherwise causes.
  // The probe and the model listing both reach the provider on a real key.
  // Everything else here is read-only, but these two are a stranger spending
  // the owner's allowance, so they are the ones that lock.
  const adminOk = (supplied) => {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) return true;          // nothing set: behave as before
    if (!supplied) return false;
    const a = Buffer.from(String(supplied));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const spendingAllowed = adminOk(url.searchParams.get("token"));

  if (!process.env.ADMIN_TOKEN) {
    out.problems.push(
      "ADMIN_TOKEN is not set, so ?probe=1 and ?models=1 are open to anyone who finds this URL " +
      "and each one spends a real model call. Set it before the link goes anywhere public.");
  }

  if (url.searchParams.get("models") === "1") {
    if (!spendingAllowed) {
      out.next = "This needs ?token=<ADMIN_TOKEN>, because it calls the provider.";
      return res.status(200).json(out);
    }
    if (!key) {
      out.next = "No key is set, so there is nothing to list models with.";
      return res.status(200).json(out);
    }
    // Providers do not agree on where the listing lives, but every
    // OpenAI-shaped one puts it beside the completions path.
    const listUrl = chatCompletionsUrl().replace(/\/chat\/completions\/?$/, "/models");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch(listUrl, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}` }
      });
      const body = await r.json().catch(() => null);
      const ids = Array.isArray(body?.data)
        ? body.data.map((m) => m?.id).filter(Boolean)
        : null;
      out.models = {
        url: listUrl,
        status: r.status,
        // Strip the prefix some providers put on every id, so what is
        // printed is what MODEL_ID should be set to.
        ids: ids ? ids.map((id) => id.replace(/^models\//, "")).sort() : null
      };
      // Only when the shape was not understood, and then in full: a reader
      // who cannot act on the ids needs the provider's own words instead.
      if (!ids) out.models.raw = body;
      out.next = ids
        ? `Set MODEL_ID to one of these. Prefer a small, fast, non-reasoning model: a model that thinks out loud spends the whole budget before it writes the JSON, which reaches the page as "unavailable".`
        : "The provider did not return a model list in the expected shape; see raw.";
    } catch (error) {
      out.models = { url: listUrl, error: `${error && error.name}: ${error && error.message}` };
      out.next = "Could not reach the model listing.";
    } finally {
      clearTimeout(timer);
    }
    return res.status(200).json(out);
  }

  if ((probeParam === "1" || probeParam === "both") && !spendingAllowed) {
    out.next = "This needs ?token=<ADMIN_TOKEN>, because it spends a real model call.";
    return res.status(200).json(out);
  }
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
  async function probe(fullUrl, body) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const upstream = await fetch(fullUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          // Same rule as the real call: Anthropic's own API reads x-api-key,
          // a compatible endpoint in front of it reads a bearer token. A
          // probe that authenticates differently from the tool proves
          // nothing about the tool.
          ...(isAnthropicDirect()
            ? { "x-api-key": key }
            : { "Authorization": `Bearer ${key}` }),
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body)
      });
      const text = await upstream.text();
      // Two different jobs, and conflating them is how a probe comes to lie.
      // "body" is for a person to read, so it is short. "full" is what the
      // verdict is computed from, so it is whole: a provider that appends a
      // long field of its own (Google sends a thought signature) pushes the
      // JSON past any truncation point, and judging the offcut reports a
      // perfectly good model as broken.
      return {
        httpStatus: upstream.status,
        elapsedMs: Date.now() - started,
        body: text.slice(0, 400),
        full: text
      };
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
  const urls = { messages: `${BASE_URL}/v1/messages`, chat: chatCompletionsUrl() };

  out.probe = {};
  for (const which of both ? ["messages", "chat"] : [configured]) {
    out.probe[which] = await probe(urls[which], which === "chat"
      // The probe has to spend the same budget the tool does, or it reports
      // that a model works at a ceiling the tool never uses.
      ? { model, max_tokens: maxOutputTokens(), messages: [{ role: "system", content: SYSTEM }, ...ask] }
      : { model, max_tokens: maxOutputTokens(), system: SYSTEM, messages: ask,
          ...(effort() ? { output_config: { effort: effort() } } : {}) });
  }
  out.probeCost = `${Object.keys(out.probe).length} provider call(s)`;

  // Judge the reply, not the status code.
  for (const r of Object.values(out.probe)) {
    if (r.httpStatus !== 200 || !r.full) continue;
    try {
      const parsed = JSON.parse(r.full);
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
    } finally {
      // Served its purpose; printing it twice helps nobody.
      delete r.full;
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

  // The verdict has to be written in terms of which endpoint is configured,
  // not which one used to be the default. Assuming "messages" means that once
  // the tool moved provider, a working setup was told to go and set a
  // variable it had already set, naming a provider it was no longer using —
  // advice that is wrong in every particular and still sounds authoritative.
  const other = configured === "chat" ? "messages" : "chat";
  const configuredOk = out.probe[configured] && out.probe[configured].usable;
  const otherOk = out.probe[other] && out.probe[other].usable;
  out.verdict =
    configuredOk
      ? `This model answers usably on the configured endpoint (${configured}). If the page still fails, the fault is after the call.`
    : otherOk
      ? `This model is not served on the configured endpoint (${configured}) but works on the other shape. Set PROVIDER_ENDPOINT=${other} in Vercel and redeploy.`
    : both
      ? "Neither endpoint answered. The lines above say why."
      : "The configured endpoint did not answer. Add ?probe=both to test the other one, at the cost of one more call.";

  return res.status(200).json(out);
}
