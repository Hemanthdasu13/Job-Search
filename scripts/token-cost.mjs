// What a conversation actually costs.
//
//   node scripts/token-cost.mjs              every bucket B and C scenario
//   node scripts/token-cost.mjs --only B3
//   node scripts/token-cost.mjs --exact      count tokens via the provider
//
// Replays whole conversations through the real ask.js and close.js against a
// mock provider, records every request body byte for byte, and prices the
// result. No provider calls unless --exact is given, so measuring costs
// nothing.
//
// Why this exists: every cost number in this project before it was an
// estimate built from an assumed turn count and an assumed answer length.
// Both assumptions were mine. This measures the turns and the lengths that
// the code actually produces, which is the only way to know whether a change
// made for cost reasons helped.
//
// Token counts are estimated from character length unless --exact is passed,
// in which case the provider's own count_tokens endpoint is used and the
// numbers are exact. The estimate is within about fifteen per cent for
// English prose; it is not good enough to justify a change on, which is what
// --exact is for.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i === -1 ? [] : (args[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
})();
const EXACT = args.includes("--exact");

// Anthropic list prices, dollars per million tokens. Cache reads are a tenth
// of input and cache writes are 1.25x, which is what makes caching a prompt
// sent once a loss rather than a saving.
const PRICES = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 }
};
const CACHE_READ = 0.1;
const CACHE_WRITE = 1.25;

const estimate = (text) => Math.round(String(text).length / 3.7);

// ---------------------------------------------------------------- the mock
//
// Answers every call with a plausible question so the conversation runs its
// full length, and closes on the last turn so the selector runs too. The
// point is to reproduce the SHAPE of a conversation, not its content: what is
// being measured is how much text the code sends, not what a model would say.
const QUESTIONS = [
  "What did the system actually have in front of it when it produced that?",
  "Which part of that could you check, and which part could you not?",
  "What did you tell it not to do, or to leave alone?",
  "Where did this sit relative to what you know well enough to judge?",
  "If it had been wrong, who would have carried that, and how would you have found out?",
  "What did using it buy you, beyond the time it saved?"
];

const recorded = [];
let turn = 0;

const mock = createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  recorded.push(body);

  const isSelector = JSON.stringify(body).includes("Your only job is to choose");
  const text = isSelector
    ? JSON.stringify({ selected: [], evidence: {} })
    : JSON.stringify({
        question: QUESTIONS[Math.min(turn++, QUESTIONS.length - 1)],
        status: "probing", reflection: null, closing_note: null
      });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] }));
});
await new Promise((r) => mock.listen(6971, r));

process.env.MODEL_API_KEY = process.env.MODEL_API_KEY || "sk-ant-measuring";
process.env.MODEL_ID = process.env.MODEL_ID || "claude-sonnet-5";
process.env.PROVIDER_BASE_URL = "http://127.0.0.1:6971";
process.env.PROVIDER_AUTH = "x-api-key";
process.env.PROVIDER_ENDPOINT = "messages";
process.env.IP_SALT = "cost";
process.env.RATE_LIMIT_PER_IP = "1000000";
process.env.DAILY_CALL_CAP = "1000000";
delete process.env.ACCESS_PINS;
delete process.env.CHAT_COMPLETIONS_URL;

const { default: ask } = await import("../api/ask.js");
const { default: close } = await import("../api/close.js");

const post = (handler, body) => new Promise((resolve) => handler(
  { method: "POST", url: "/x", headers: { host: "x", "x-forwarded-for": "1.1.1.1" }, body, socket: {} },
  { setHeader() {}, status() { return this; }, json: resolve }
));

// The page's own ceiling, read from the page so the two cannot disagree.
const pageSrc = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const MAX_PROBING = Number(pageSrc.match(/var MAX_PROBING_TURNS = (\d+)/)[1]);

// ------------------------------------------------------------ one scenario
async function measure(scenario) {
  recorded.length = 0;
  turn = 0;

  // What a person types: their account, then one answer per probing turn,
  // drawn from what the scenario says each line of questioning would surface.
  const opening = scenario.account.join(" ");
  const replies = Object.values(scenario.pressed);

  const answers = [opening];
  const questions = [];

  for (let i = 0; i < MAX_PROBING; i++) {
    const reply = await post(ask, { answers, questions });
    if (!reply.ok) break;
    questions.push(reply.question);
    if (i < replies.length) answers.push(replies[i]);
    else break;
  }
  await post(close, { answers });

  // Price what was actually sent.
  let cachedIn = 0, uncachedIn = 0, out = 0, cacheWrites = 0, cacheReads = 0;
  const seenPrefixes = new Set();

  for (const body of recorded) {
    const cacheable = Array.isArray(body.system);
    const systemText = cacheable ? body.system.map((b) => b.text).join("") : String(body.system || "");
    const messagesText = JSON.stringify(body.messages || "");

    const systemTokens = await countTokens(systemText);
    const messageTokens = await countTokens(messagesText);

    uncachedIn += systemTokens + messageTokens;

    if (cacheable) {
      if (seenPrefixes.has(systemText)) {
        cachedIn += systemTokens * CACHE_READ + messageTokens;
        cacheReads += systemTokens;
      } else {
        seenPrefixes.add(systemText);
        cachedIn += systemTokens * CACHE_WRITE + messageTokens;
        cacheWrites += systemTokens;
      }
    } else {
      cachedIn += systemTokens + messageTokens;
    }

    // Output is what the model writes: the JSON plus whatever thinking it did
    // before it. Thinking is not visible here, so this is the floor.
    out += 120;
  }

  return {
    id: scenario.id, name: scenario.name,
    calls: recorded.length,
    uncachedIn: Math.round(uncachedIn),
    cachedIn: Math.round(cachedIn),
    out, cacheWrites, cacheReads
  };
}

// Exact when a real key is available and --exact was asked for; estimated
// otherwise. Never silently exact, and never silently estimated.
let exactCalls = 0;
async function countTokens(text) {
  if (!EXACT) return estimate(text);
  exactCalls++;
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": process.env.MODEL_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.MODEL_ID,
      messages: [{ role: "user", content: text || "." }]
    })
  });
  if (!res.ok) {
    console.error(`count_tokens failed (${res.status}); falling back to the estimate for the rest.`);
    return estimate(text);
  }
  return (await res.json()).input_tokens;
}

// ------------------------------------------------------------------- run it
const set = JSON.parse(await readFile(new URL("../evals/buckets.json", import.meta.url), "utf8"));
let scenarios = set.scenarios.filter((s) => s.bucket !== "A");
if (ONLY.length) scenarios = scenarios.filter((s) => ONLY.includes(s.id));

console.log(`Replaying ${scenarios.length} conversation(s) against a mock provider.`);
console.log(EXACT
  ? "Token counts: exact, via count_tokens. This spends a call per measurement."
  : "Token counts: estimated from length (within about 15%). Pass --exact for real counts.");
console.log("");

const rows = [];
for (const s of scenarios) rows.push(await measure(s));
mock.close();

const price = (model, input, output) =>
  (input * PRICES[model].in + output * PRICES[model].out) / 1e6;

console.log("id    calls   input (uncached -> cached)   output    Sonnet 5   Opus 5");
for (const r of rows) {
  console.log(
    `${r.id.padEnd(5)} ${String(r.calls).padStart(5)}   ` +
    `${String(r.uncachedIn).padStart(7)} -> ${String(r.cachedIn).padEnd(7)}      ` +
    `${String(r.out).padStart(5)}    ` +
    `${("$" + price("claude-sonnet-5", r.cachedIn, r.out).toFixed(4)).padStart(8)}  ` +
    `${("$" + price("claude-opus-5", r.cachedIn, r.out).toFixed(4)).padStart(8)}`
  );
}

const avg = (f) => rows.reduce((n, r) => n + f(r), 0) / rows.length;
const aCalls = avg((r) => r.calls);
const aUncached = avg((r) => r.uncachedIn);
const aCached = avg((r) => r.cachedIn);
const aOut = avg((r) => r.out);

console.log("");
console.log(`Average conversation: ${aCalls.toFixed(1)} calls, ` +
  `${Math.round(aUncached)} input tokens uncached, ${Math.round(aCached)} cached, ` +
  `${Math.round(aOut)} output.`);
console.log(`Caching saves ${(100 * (1 - aCached / aUncached)).toFixed(0)}% of input.`);
console.log("");

for (const model of Object.keys(PRICES)) {
  const per = price(model, aCached, aOut);
  console.log(`${model.padEnd(18)} ${("$" + per.toFixed(4)).padStart(9)} per conversation   ` +
    `£5 buys about ${Math.floor(6.35 / per)}`);
}

console.log("");
console.log("Output is a floor: it counts the JSON and not the thinking that");
console.log("precedes it, which is billed too and varies with effort. Treat the");
console.log("output column as the least it can be, not the most.");
if (EXACT) console.log(`\n${exactCalls} count_tokens calls were spent measuring this.`);
