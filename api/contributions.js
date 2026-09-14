// Reads back the conversations people chose to contribute. Private: it needs
// ADMIN_TOKEN, which only the researcher has. Without that variable set the
// endpoint refuses everything rather than defaulting to open, because the
// failure mode of getting this wrong is publishing other people's words.
//
//   /api/contributions?token=...            newest 50
//   /api/contributions?token=...&limit=200
//   /api/contributions?token=...&version=0.2.0
//
// Curating these is a person's job. Nothing here feeds back into the tool.

import { kvCall, kvEnabled } from "./_limits.js";
import { VERSION } from "./_version.js";
import { timingSafeEqual } from "node:crypto";

const LOG_KEY = "contrib:log";

function tokenMatches(supplied) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !supplied) return false;
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url, "http://localhost");

  if (!tokenMatches(url.searchParams.get("token"))) {
    return res.status(404).json({ error: "not found" });
  }
  if (!kvEnabled) {
    return res.status(200).json({ currentVersion: VERSION, storage: "not configured", conversations: [] });
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
  const raw = (await kvCall(["LRANGE", LOG_KEY, "0", String(limit - 1)])) || [];
  let conversations = raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);

  const version = url.searchParams.get("version");
  if (version) conversations = conversations.filter((c) => c.version === version);

  const byVersion = {};
  const byEnding = {};
  for (const c of conversations) {
    byVersion[c.version] = (byVersion[c.version] || 0) + 1;
    byEnding[c.endedOn] = (byEnding[c.endedOn] || 0) + 1;
  }

  return res.status(200).json({
    currentVersion: VERSION,
    returned: conversations.length,
    byVersion,
    byEnding,
    note: "Conversations contributed with consent. No identifiers are stored, so these cannot be linked to a person or to each other.",
    conversations
  });
}
