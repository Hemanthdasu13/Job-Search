// Who is allowed to start a conversation.
//
// A gate on the page alone is decoration: the page is public, anyone can read
// its source, and anyone can post straight to /api/ask. So the check is here,
// the model endpoints refuse without it, and the page's job is only to ask
// nicely for the thing the server is going to verify anyway.
//
// Configuration, all optional:
//
//   ACCESS_PINS    the gate. Comma-separated, each either "123456" or
//                  "123456:label". The label is for the owner's own
//                  bookkeeping and never reaches the page. Unset means the
//                  gate is off and the tool is open, which is the state a
//                  CV link is usually in.
//   ACCESS_SECRET  optional HMAC key. If unset it is derived from the pin
//                  list, which is already a secret and already unguessable.
//                  That way setting one variable is enough: a half-configured
//                  gate that silently admits everyone is the failure worth
//                  designing out, because its whole point is that the owner
//                  believes it is shut.
//   ACCESS_HOURS   how long an unlocked session lasts. Default 12.
//
// What this deliberately does not do: it does not tie a pin to anything the
// person types. The page promises that nothing typed is stored, and a gate is
// not a reason to break that. What the owner learns is who asked them for a
// pin, which is a conversation with a named human and worth more than a log
// line anyway.

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function parsePins() {
  const raw = process.env.ACCESS_PINS || "";
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const at = entry.indexOf(":");
    return at === -1
      ? { pin: entry, label: entry.slice(0, 2) + "…" }
      : { pin: entry.slice(0, at).trim(), label: entry.slice(at + 1).trim() || "unlabelled" };
  }).filter((p) => p.pin);
}

export function accessEnabled() {
  return parsePins().length > 0;
}

// The pin list doubles as the key when no separate secret is set. It is not a
// second factor, it is just unguessable material that every instance of the
// function already shares, which is exactly what signing needs.
function signingKey() {
  return process.env.ACCESS_SECRET || `derived:${process.env.ACCESS_PINS || ""}`;
}

function constantTimeEquals(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  // Comparing to itself on a length mismatch keeps the work, and the time,
  // the same whether the length was right or not.
  const same = x.length === y.length;
  return timingSafeEqual(same ? x : y, y) && same;
}

// Returns the matching pin's label, or null. Every pin is checked even after
// one matches, so the time taken says nothing about which one it was or how
// far down the list it sat.
export function labelForPin(supplied) {
  if (typeof supplied !== "string" || !supplied.trim()) return null;
  const candidate = supplied.trim();
  let found = null;
  for (const { pin, label } of parsePins()) {
    if (constantTimeEquals(candidate, pin)) found = label;
  }
  return found;
}

export function accessHours() {
  const h = Number(process.env.ACCESS_HOURS);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

export function mintToken(label, now = Date.now()) {
  const payload = b64url(JSON.stringify({
    l: label,
    exp: now + accessHours() * 3600 * 1000,
    // So two people admitted on the same pin do not hold identical tokens.
    n: randomUUID().slice(0, 8)
  }));
  const mac = b64url(createHmac("sha256", signingKey()).update(payload).digest());
  return `${payload}.${mac}`;
}

// Returns { ok, label } or { ok: false, reason }. Never throws: a malformed
// token is a visitor with a stale tab, not an incident.
export function verifyToken(token, now = Date.now()) {
  if (!accessEnabled()) return { ok: true, label: null };
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "no_token" };
  const [payload, mac] = token.split(".", 2);
  const expected = b64url(createHmac("sha256", signingKey()).update(payload).digest());
  if (!constantTimeEquals(mac, expected)) return { ok: false, reason: "bad_token" };
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_token" };
  }
  if (!claims || typeof claims.exp !== "number") return { ok: false, reason: "bad_token" };
  if (claims.exp < now) return { ok: false, reason: "expired_token" };
  return { ok: true, label: claims.l || null };
}

// A shared helper so ask.js and close.js cannot drift on what "allowed" means.
// Reads the token from the header, because it is not the person's content and
// has no business in the body alongside what they wrote.
export function tokenFrom(req) {
  const header = req.headers?.["x-access-token"];
  return typeof header === "string" ? header : "";
}
