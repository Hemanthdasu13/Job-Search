// How the research is allowed to be referred to on screen.
//
//   node scripts/verify-voice.mjs
//
// One noun: the research. Not "participants", not "one participant", not "the
// study", not "the interviews", not "someone said". Counts stay, because the
// counts are the evidence. A finding resting on a single case is still marked
// as one case, but without narrating a person.
//
// This exists because the rule was given twice and broken twice. Sixteen of
// the seventeen cards were written as "five participants had adopted", "one
// argued", "one stated it as a hiring rule" - which reads like a write-up of
// a focus group rather than someone telling you what they found out. A rule
// that lives only in a conversation is a rule that comes back.
//
// Two allowances, both deliberate:
//
//   the caveat   "Eighteen interviews, sixteen sectors..." is a citation, not
//                prose. It appears once per closing screen, under a rule, in
//                mono, and it is mandated verbatim by RESEARCH_FACTS.md.
//   the offer    "I'd contribute an interview" is a link offering to be
//                interviewed. It is not attribution.

import { readFileSync } from "node:fs";

const PAGE = "public/index.html";
const src = readFileSync(PAGE, "utf8");

// The mandated caveat, and the standing link. Removed before checking so they
// cannot be mistaken for prose, and asserted separately below.
const CAVEAT =
  "Eighteen interviews, sixteen sectors. Exploratory qualitative research, single coder, not a validated instrument.";
const OFFER = "I'd contribute an interview";

const BANNED = [
  [/\bparticipants?\b/gi, 'say "the research"'],
  [/\bthe interviews?\b/gi, 'say "the research"'],
  [/\bthe study\b/gi, 'say "the research"'],
  // "Not one described a rule for when to believe what came out" is the
  // landing page's hinge and the wording the facts file requires, so the ban
  // is on the attributing form only.
  [/(?<!\bnot )\bone (?:stated|argued|described|said|framed|identified)\b/gi,
   'say "one case in the research"'],
  [/\bsomeone (?:said|described|told)\b/gi, 'say "one case in the research"'],
  [/\bwe interviewed\b/gi, 'say "the research"'],
  [/\bin the sample\b/gi, 'say "in the research"']
];

// Only what a visitor reads: the card bodies and the closing-screen prose.
// Code comments are for whoever maintains this and are left alone.
function visibleStrings() {
  const out = [];

  const cards = src.match(/var PRACTICES = \{[\s\S]*?\n  \};/);
  if (!cards) throw new Error("could not find the card library");
  for (const m of cards[0].matchAll(/(concept|principle|why|action): "((?:[^"\\]|\\.)*)"/g)) {
    out.push({ where: `card ${m[1]}`, text: JSON.parse(`"${m[2]}"`) });
  }

  // Markup inside the screens, tags stripped.
  for (const s of src.matchAll(/<section class="screen"[^>]*id="(s\d[a-z]?g?)"[^>]*>([\s\S]*?)<\/section>/g)) {
    const id = s[1];
    for (const el of s[2].matchAll(/<(h1|h2|h3|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/g)) {
      const text = el[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text) out.push({ where: id, text });
    }
  }

  // Strings the script writes into the page at runtime.
  for (const m of src.matchAll(/textContent = "((?:[^"\\]|\\.)*)"/g)) {
    out.push({ where: "runtime text", text: JSON.parse(`"${m[1]}"`) });
  }
  for (const m of src.matchAll(/^\s*" ((?:[^"\\]|\\.)*)";$/gm)) {
    out.push({ where: "runtime text", text: JSON.parse(`" ${m[1]}"`) });
  }
  return out;
}

const failures = [];
for (const { where, text } of visibleStrings()) {
  const stripped = text.split(CAVEAT).join(" ").split(OFFER).join(" ");
  for (const [re, fix] of BANNED) {
    for (const hit of stripped.match(re) || []) {
      failures.push({ where, hit, fix, text: stripped.slice(0, 100) });
    }
  }
}

// The caveat must still be present, verbatim, on each of the three closing
// screens. Dropping it is the opposite failure and just as easy to make.
const caveats = (src.match(new RegExp(CAVEAT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
if (caveats < 3) {
  failures.push({
    where: "closing screens",
    hit: `caveat present ${caveats} times`,
    fix: "it is mandated verbatim on 5A, 5B and 5C",
    text: CAVEAT
  });
}

for (const f of failures) {
  console.error(`FAIL ${f.where}: "${f.hit}" - ${f.fix}\n       ${f.text}`);
}
console.log(`checked visible copy; caveat appears ${caveats} times`);
if (failures.length) {
  console.error(`\n${failures.length} voice check(s) failed`);
  process.exit(1);
}
console.log("voice checks passed: the research is the only thing cited");
