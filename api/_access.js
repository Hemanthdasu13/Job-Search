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

import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// "123456", "123456:label", or "123456:label:2" — the third field is how many
// conversations that key is good for. One by default, because the point of
// handing keys out individually is that each one is an individual grant; 0
// means unlimited, for a key you keep for yourself.
function parsePins() {
  const raw = process.env.ACCESS_PINS || "";
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [pin, label, uses] = entry.split(":").map((part) => (part || "").trim());
    const n = Number(uses);
    return {
      pin,
      label: label || (pin ? pin.slice(0, 2) + "…" : "unlabelled"),
      conversations: Number.isFinite(n) && n >= 0 ? n : 1
    };
  }).filter((p) => p.pin);
}

// How many model calls one conversation may make. Matches the page's own
// ceiling, so a key worth one conversation cannot fund a second.
export function callsPerConversation() {
  const n = Number(process.env.CALLS_PER_CONVERSATION);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

// The counter is keyed on a hash, never the pin. A key list is a secret, and
// a store full of plaintext keys is a worse thing to lose than a store full
// of hashes.
function fingerprint(pin) {
  return createHash("sha256").update("pin:").update(String(pin)).digest("hex").slice(0, 16);
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
export function grantForPin(supplied) {
  if (typeof supplied !== "string" || !supplied.trim()) return null;
  const candidate = supplied.trim();
  let found = null;
  for (const entry of parsePins()) {
    if (constantTimeEquals(candidate, entry.pin)) {
      found = {
        label: entry.label,
        conversations: entry.conversations,
        fingerprint: fingerprint(entry.pin)
      };
    }
  }
  return found;
}

export function accessHours() {
  const h = Number(process.env.ACCESS_HOURS);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

export function mintToken(grant, now = Date.now()) {
  // Accepts a plain label too, so a caller that only has a name still mints a
  // working token.
  const g = typeof grant === "string" ? { label: grant, conversations: 0, fingerprint: "" } : grant;
  const payload = b64url(JSON.stringify({
    l: g.label,
    // The allowance travels inside the signed token rather than being looked
    // up again on every call. It cannot be edited without breaking the
    // signature, and a key removed from the list stops working immediately,
    // because removing it changes the signing material.
    c: g.conversations,
    f: g.fingerprint,
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
  return {
    ok: true,
    label: claims.l || null,
    conversations: Number.isFinite(claims.c) ? claims.c : 0,
    fingerprint: claims.f || ""
  };
}

// Spending a key's allowance.
//
// The budget belongs to the KEY, not to the browser and not to the token. A
// browser can be cleared, a token can be minted again from the same pin, and
// an address changes on a train. The pin is the thing that was handed to a
// person, so it is the thing that runs out.
//
// Counted in model calls rather than conversations, because a call is what
// costs money and because counting calls cannot be gamed: there is no first
// turn to skip, no identifier to forge, nothing to reset. One conversation is
// callsPerConversation() of them.
//
// The counter outlives the token deliberately — ninety days — so "this key is
// good for one conversation" means one conversation, not one per session.
const SPEND_TTL_SECONDS = 90 * 24 * 3600;

export async function spendKeyCall(access, bump) {
  // No gate, or a key with no stated allowance: nothing to meter.
  if (!access?.fingerprint || !access.conversations) return { allowed: true };
  const allowance = access.conversations * callsPerConversation();
  const used = await bump(`keyspend:${access.fingerprint}`, SPEND_TTL_SECONDS);
  if (used === null || used === undefined) return { allowed: true }; // counter unavailable: do not lock anyone out
  if (used > allowance) {
    return { allowed: false, reason: "key_spent" };
  }
  return { allowed: true, used, allowance };
}

// Read without spending, so the gate can turn someone away at the door
// rather than three questions into a conversation.
export async function keyAlreadySpent(grant, peek) {
  if (!grant?.fingerprint || !grant.conversations) return false;
  const used = await peek(`keyspend:${grant.fingerprint}`);
  if (used === null || used === undefined) return false;
  return Number(used) >= grant.conversations * callsPerConversation();
}

// A shared helper so ask.js and close.js cannot drift on what "allowed" means.
// Reads the token from the header, because it is not the person's content and
// has no business in the body alongside what they wrote.
export function tokenFrom(req) {
  const header = req.headers?.["x-access-token"];
  return typeof header === "string" ? header : "";
}
