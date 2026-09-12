// Aggregate hit counter. Two integers in the optional KV store, nothing else:
// no identifiers, no request body, no per-visitor record. Without a KV store
// configured it does nothing and says so.

import { countHit } from "./_limits.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const counted = await countHit();
  return res.status(200).json({ ok: true, counted });
}
