// Stores one finished conversation, and only ever when the person ticked the
// box asking for it.
//
// Consent is prior, specific and opt-in: the box starts unticked, the page
// says plainly what happens either way, and nothing reaches this endpoint
// unless it was ticked before they typed. Without a ticked box the site
// stores nothing at all, which is what the page promises.
//
// What is kept: what they typed, what they were asked, how it ended, and the
// version of the tool that produced it. What is not kept: any identifier. No
// IP, no hash of an IP, no session, no cookie. Two conversations from the
// same person are not linkable, including by whoever reads them back.
//
// The version matters as much as the content. A conversation collected under
// one system prompt is not evidence about another, and curating them together
// would mix instruments.
//
// Requires OPENROUTER-independent storage: UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN. Without them the page never offers the box.

import { kvCall, kvEnabled, claimModelCall } from "./_limits.js";
import { VERSION } from "./_version.js";

const LOG_KEY = "contrib:log";
const KEEP = 5000;                       // newest kept, oldest dropped
const TTL_DAYS = Number(process.env.CONTRIBUTION_TTL_DAYS) || 180;

const MAX_TURNS = 12;
const MAX_CHARS = 1500;
const MAX_TOTAL = 12000;

function clean(body) {
  const answers = body?.answers;
  const questions = body?.questions;
  if (body?.consent !== true) return null;               // the whole gate
  if (!Array.isArray(answers) || !Array.isArray(questions)) return null;
  if (!answers.length || answers.length > MAX_TURNS) return null;
  if (questions.length > MAX_TURNS) return null;
  if (!answers.every((a) => typeof a === "string" && a.length <= MAX_CHARS)) return null;
  if (!questions.every((q) => typeof q === "string" && q.length <= MAX_CHARS)) return null;
  const total = [...answers, ...questions].reduce((n, s) => n + s.length, 0);
  if (total > MAX_TOTAL) return null;

  const ending = ["reached", "verified", "off_topic", "exhausted", "unavailable"];
  return {
    version: VERSION,
    at: new Date().toISOString(),
    endedOn: ending.includes(body?.endedOn) ? body.endedOn : "unknown",
    turns: answers.length,
    answers,
    questions,
    reflection: typeof body?.reflection === "string" ? body.reflection.slice(0, 400) : null
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!kvEnabled) return res.status(200).json({ ok: true, available: false, stored: false });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const record = clean(body);
  // An empty body is the page asking whether contributing is possible here.
  if (!record) return res.status(200).json({ ok: true, available: true, stored: false });

  // Shares the per-IP budget so the store cannot be flooded. The budget uses
  // a hashed IP as a short-lived counter key and never touches the record.
  const claim = await claimModelCall(req);
  if (!claim.allowed) return res.status(200).json({ ok: true, available: true, stored: false });

  const written = await kvCall(["LPUSH", LOG_KEY, JSON.stringify(record)]);
  if (written === null) return res.status(200).json({ ok: true, available: true, stored: false });
  await kvCall(["LTRIM", LOG_KEY, "0", String(KEEP - 1)]);
  await kvCall(["EXPIRE", LOG_KEY, String(TTL_DAYS * 86400)]);

  return res.status(200).json({ ok: true, available: true, stored: true });
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
