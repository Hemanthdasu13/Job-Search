// Local dev server. Not deployed - Vercel serves index.html and api/* directly.
//
//   node dev.mjs                  stubbed model, no API key needed
//   STUB=0 node dev.mjs           real api/ask.js (needs ANTHROPIC_API_KEY)
//
// STUB_SEQUENCE drives the stub through specific statuses, one per turn,
// so every branch of the client state machine can be exercised by hand:
//   STUB_SEQUENCE=probing,probing,reached node dev.mjs
//   STUB_SEQUENCE=probing,verified node dev.mjs
//   STUB_SEQUENCE=off_topic,off_topic node dev.mjs
//   STUB_SEQUENCE=fail node dev.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT || 3000);
const STUB = process.env.STUB !== "0";
const SEQUENCE = (process.env.STUB_SEQUENCE || "probing,probing,probing,probing")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STUB_QUESTIONS = [
  "What did the model have in front of it when it produced that?",
  "Which part of that could you have checked, and which part could you not?",
  "Who else saw it before it was used, and what could they see that you could not?",
  "If it had been wrong, how would you have found out?"
];

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

async function stubAsk(req, res) {
  const body = await readBody(req);
  const turn = Array.isArray(body.questions) ? body.questions.length : 0;
  const status = SEQUENCE[Math.min(turn, SEQUENCE.length - 1)];

  // Latency, so the thinking state is actually visible.
  await new Promise((r) => setTimeout(r, 600));

  if (status === "fail") return json(res, 200, { ok: false });

  console.log(`  [stub] turn ${turn} -> ${status}`);
  json(res, 200, {
    ok: true,
    question: STUB_QUESTIONS[Math.min(turn, STUB_QUESTIONS.length - 1)],
    status
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/api/hit") return json(res, 200, { ok: true, counted: false });

  if (path === "/api/ask") {
    if (req.method !== "POST") return json(res, 405, { ok: false });
    if (STUB) return stubAsk(req, res);
    const mod = await import("./api/ask.js");
    const body = await readBody(req);
    return mod.default(
      Object.assign(req, { body }),
      Object.assign(res, {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          json(res, this.statusCode || 200, payload);
        }
      })
    );
  }

  // Any .html sitting in the project root, so styling variants can be
  // compared side by side without editing this file each time.
  if (path === "/" || /^\/[a-z0-9-]+\.html$/.test(path)) {
    const file = path === "/" ? "./public/index.html" : "./public" + path;
    const html = await readFile(new URL(file, import.meta.url)).catch(() => null);
    if (!html) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(html);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("error", (err) => {
  console.error(`dev server failed: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}  (stub=${STUB}, sequence=${SEQUENCE.join(",")})`);
});
