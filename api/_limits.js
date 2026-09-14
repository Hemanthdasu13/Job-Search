// Rate limiting and the daily cap.
//
// Two backends. If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
// set, counters are shared across every function instance and survive cold
// starts. Without them, counters live in the memory of whichever instance
// serves the request: correct while an instance stays warm, best effort
// across concurrent ones. Nothing here stores user input, and IP addresses
// are hashed before they are used as a key.

import { createHash } from "node:crypto";

const KV_URL = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvEnabled = Boolean(KV_URL && KV_TOKEN);

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const LIMITS = {
  perIp: num(process.env.RATE_LIMIT_PER_IP, 15),
  windowSeconds: num(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60,
  perDay: num(process.env.DAILY_CALL_CAP, 300)
};

/* ------------------------------- backends ------------------------------- */

async function kvIncr(key, ttlSeconds) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(ttlSeconds), "NX"]
    ])
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  const [incr] = await res.json();
  if (incr.error) throw new Error("kv command failed");
  return Number(incr.result);
}

// Any Redis command, for callers that need more than a counter. Returns null
// rather than throwing when there is no store or the store is unreachable:
// nothing here is allowed to take the site down.
export async function kvCall(command) {
  if (!kvEnabled) return null;
  try {
    const res = await fetch(KV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.error ? null : body.result;
  } catch {
    return null;
  }
}

const memory = new Map();

function memoryIncr(key, ttlSeconds, now) {
  const existing = memory.get(key);
  if (existing && existing.expires > now) {
    existing.count += 1;
    return existing.count;
  }
  if (memory.size > 5000) memory.clear(); // crude bound; keys are short lived
  memory.set(key, { count: 1, expires: now + ttlSeconds * 1000 });
  return 1;
}

// Never let a counter failure take the endpoint down: on a KV error we fall
// back to the in-memory counter for this request.
async function incr(key, ttlSeconds, now) {
  if (kvEnabled) {
    try {
      return await kvIncr(key, ttlSeconds);
    } catch {
      /* fall through */
    }
  }
  return memoryIncr(key, ttlSeconds, now);
}

/* -------------------------------- keys ---------------------------------- */

const SALT = process.env.IP_SALT || "no-salt-set";

export function hashIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const ip =
    forwarded.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";
  return createHash("sha256").update(SALT).update(String(ip)).digest("hex").slice(0, 24);
}

const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

/* ------------------------------- public --------------------------------- */

// Charges one model call against both budgets. The per-IP budget is checked
// first so that one visitor cannot burn the day's cap for everyone else.
export async function claimModelCall(req, now = Date.now()) {
  const window = Math.floor(now / (LIMITS.windowSeconds * 1000));
  const ipCount = await incr(
    `ask:ip:${hashIp(req)}:${window}`,
    LIMITS.windowSeconds,
    now
  );
  if (ipCount > LIMITS.perIp) return { allowed: false, reason: "ip_rate_limit" };

  const dayCount = await incr(`ask:day:${dayKey(now)}`, 172800, now);
  if (dayCount > LIMITS.perDay) return { allowed: false, reason: "daily_cap" };

  return { allowed: true };
}

export async function countHit(now = Date.now()) {
  if (!kvEnabled) return false;
  try {
    await kvIncr(`hits:${dayKey(now)}`, 60 * 60 * 24 * 400);
    await kvIncr("hits:total", 60 * 60 * 24 * 400);
    return true;
  } catch {
    return false;
  }
}
