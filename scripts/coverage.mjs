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

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

// The six from the prompt, plus two that the questions keep landing on which
// the prompt does not name: how they would find out, and what the thing it
// was checked against could itself see.
const AXES = {
  "inputs/source": [
    /what (it|the (model|system|tool)) (actually )?(had|have)/i,
    /did you (check|compare|verify|confirm)[^?]*(against|with)/i,
    /where did .* come from/i,
    /beyond what you gave it/i,
    /source(d|s)?\b/i, /\bmaterial\b/i, /\binputs?\b/i,
    /had no way of seeing/i, /wouldn't have seen/i, /couldn't see/i,
    /identical material/i, /same (brief|prompt|material|data)/i,
    /accurate|current|recent/i
  ],
  "constraints": [
    /what did you (ask|tell) it to (include|use|do)/i,
    /tell it (not )?to leave out/i, /told it not to/i,
    /rule(d)? out/i, /instruct/i
  ],
  "reliance": [
    /what (did you do|happened) (with|once|after)/i,
    /what it (fed|produced) .*(went|used)/i,
    /acted on/i, /went to/i, /applied that/i
  ],
  "domain": [
    /you already knew/i, /well enough to judge/i,
    /knowledge specific to/i, /outside (your|that) (own )?(domain|knowledge)/i,
    /could .* judge it/i, /guessing at/i
  ],
  "consequence": [
    /what would happen (to|if)/i, /if it (had been|turned out|was) wrong/i,
    /who (would|was) (be )?affected/i, /cost\b/i, /\bat stake\b/i
  ],
  "advantage": [
    /what did (using )?it (actually )?(buy|give) you/i,
    /beyond the time/i, /faster|quicker|saved you/i,
    /what you could not have done/i
  ],
  "detection": [
    /how (will|would) you (find out|know|catch)/i,
    /what would (alert|tell|warn) you/i,
    /catch an error/i, /before you acted/i, /need to see to catch/i,
    /came up that weren't/i
  ]
};

function classify(q) {
  const hits = [];
  for (const [axis, pats] of Object.entries(AXES)) {
    if (pats.some((p) => p.test(q))) hits.push(axis);
  }
  return hits;
}

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
