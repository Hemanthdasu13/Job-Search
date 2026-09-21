// Exchanges a pin for a short-lived token.
//
// The only interesting thing about this endpoint is that it has to survive
// someone guessing. A pin is short by design — it has to be readable over
// WhatsApp — so the arithmetic that keeps it safe is the attempt limit, not
// the pin length. Ten attempts an hour against a six-digit pin is a thousand
// years; against a four-digit pin it is about forty days, which is why the
// diagnostic complains about short pins rather than leaving it to chance.
//
// The counter is keyed on a hashed address and shared through the same store
// as everything else, so it cannot be reset by opening a new tab or by the
// request landing on a different instance.

import { accessEnabled, grantForPin, mintToken, accessHours,
         keyAlreadySpent, callsPerConversation } from "./_access.js";
import { bumpCounter, hashIp, readCounter } from "./_limits.js";
import { VERSION } from "./_version.js";

const BUILD = `${VERSION}@${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}`;

const ATTEMPT_WINDOW_SECONDS = 3600;
function maxAttempts() {
  const n = Number(process.env.ACCESS_MAX_ATTEMPTS);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4000) return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return res.status(200).json({ ok: false, reason: "method_not_post" });
  if (!sameOrigin(req)) return res.status(200).json({ ok: false, reason: "cross_origin" });

  // No pins configured means no gate. Saying so plainly beats handing out a
  // token that means nothing, and the page uses this to skip the screen.
  if (!accessEnabled()) {
    return res.status(200).json({ ok: true, open: true, build: BUILD });
  }

  const body = await readJsonBody(req);
  const supplied = typeof body?.pin === "string" ? body.pin : "";

  const attempts = await bumpCounter(`unlock:${hashIp(req)}`, ATTEMPT_WINDOW_SECONDS);
  if (attempts > maxAttempts()) {
    // Deliberately the same shape as a wrong pin, with a different reason.
    // Someone guessing learns only that they have run out; someone who
    // mistyped theirs four times learns to go and check it.
    return res.status(200).json({
      ok: false,
      reason: "too_many_attempts",
      retryAfterMinutes: Math.ceil(ATTEMPT_WINDOW_SECONDS / 60),
      build: BUILD
    });
  }

  const grant = grantForPin(supplied);
  if (!grant) {
    return res.status(200).json({
      ok: false,
      reason: "wrong_pin",
      attemptsLeft: Math.max(0, maxAttempts() - attempts),
      build: BUILD
    });
  }

  // A key that has already been used up is turned away here, at the door,
  // rather than three questions into a conversation. Being stopped before
  // you have written anything is a different experience from being stopped
  // after you have described your own work.
  if (await keyAlreadySpent(grant, readCounter)) {
    console.log("unlock_spent", grant.label);
    return res.status(200).json({ ok: false, reason: "key_spent", build: BUILD });
  }

  // The label identifies the key to its owner and never leaves the server.
  console.log("unlock_ok", grant.label, grant.conversations || "unlimited");
  return res.status(200).json({
    ok: true,
    open: false,
    token: mintToken(grant),
    hours: accessHours(),
    // So the page can say "this key is good for one conversation" rather than
    // letting someone discover the limit by hitting it.
    conversations: grant.conversations || null,
    build: BUILD
  });
}
