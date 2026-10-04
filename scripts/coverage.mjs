// Which ground the questions actually cover.
//
//   node scripts/coverage.mjs --file conversations.json
//   node scripts/coverage.mjs --base https://... --token $ADMIN_TOKEN
//
// The prompt names six kinds of ground to reach across, roughly one a turn.
// Whether it does is not something anybody can tell by reading a transcript
// and forming an impression - which is the same mistake the whole tool is
// about - so this counts.
//
// Classification is by keyword and it is crude on purpose: a question can
// land in two axes and is counted in both, and anything it cannot place is
// reported as unplaced rather than quietly dropped. Crude and visible beats
// clever and unauditable for something whose only job is to say "you are
// asking the same thing over and over".

import { readFileSync } from "node:fs";
import { AXES, classify } from "../api/_axes.js";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

// The classifier lives in api/_axes.js, because the server uses it to tell
// the model what ground is covered. Two copies would drift, and the copy
// that matters is the one the model is told.
const file = arg("file");
let data;
if (file) {
  data = JSON.parse(readFileSync(file, "utf8"));
} else {
  const base = (arg("base") || "").replace(/\/$/, "");
  const token = arg("token");
  if (!base || !token) {
    console.error("need --file, or --base and --token");
    process.exit(2);
  }
  const res = await fetch(`${base}/api/contributions?token=${encodeURIComponent(token)}&limit=200`);
  data = await res.json();
}

const convs = data.conversations || [];
// The page's own fixed redirect is not a question the model chose.
const REDIRECT = "This only works on something you actually did";

const counts = {};
const unplaced = [];
let total = 0;
const perConv = [];

for (const c of convs) {
  const qs = (c.questions || []).filter((q) => !q.startsWith(REDIRECT));
  const axes = [];
  for (const q of qs) {
    total++;
    const hits = classify(q);
    if (!hits.length) unplaced.push(q);
    for (const a of hits) counts[a] = (counts[a] || 0) + 1;
    axes.push(hits.length ? hits.join("+") : "unplaced");
  }
  perConv.push({ at: c.at.slice(0, 16).replace("T", " "), ended: c.endedOn, asked: qs.length, axes });
}

console.log(`${convs.length} conversation(s), ${total} model-written question(s)\n`);
for (const c of perConv) {
  console.log(`  ${c.at}  ${c.ended.padEnd(11)} ${c.asked} asked`);
  c.axes.forEach((a, i) => console.log(`      ${i + 1}. ${a}`));
}

console.log(`\n${"ground".padEnd(16)} questions   share`);
const order = Object.keys(AXES);
for (const a of order) {
  const n = counts[a] || 0;
  const pct = total ? Math.round((n / total) * 100) : 0;
  const bar = "#".repeat(Math.round(pct / 4));
  console.log(`${a.padEnd(16)} ${String(n).padStart(6)}   ${String(pct).padStart(3)}%  ${bar}`);
}
const named = order.filter((a) => !counts[a]);
console.log(`\nnever asked: ${named.length ? named.join(", ") : "none"}`);
if (unplaced.length) {
  console.log(`\nunplaced (${unplaced.length}) - the classifier could not place these, not necessarily a fault:`);
  for (const q of unplaced) console.log(`  - ${q.slice(0, 96)}`);
}

// Three in a row on the same ground is the thing that reads as a rut.
let worst = 0;
for (const c of perConv) {
  let run = 1;
  for (let i = 1; i < c.axes.length; i++) {
    run = c.axes[i] === c.axes[i - 1] ? run + 1 : 1;
    worst = Math.max(worst, run);
  }
}
console.log(`\nlongest run of consecutive questions on identical ground: ${worst}`);
