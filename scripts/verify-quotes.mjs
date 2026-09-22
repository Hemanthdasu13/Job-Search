// Participant quotes, checked against consent and against their source.
//
// The quotes were given for a dissertation, reported under participant codes
// with generalised roles. A public page is a different purpose from the one
// consented to, so none of them is cleared for publication yet, and the
// default position is that a quote which has not been cleared must not be in
// the file the browser downloads. Hiding one behind a CSS rule or a
// JavaScript branch does not count: the words still ship, and view-source is
// not a consent boundary.
//
// Two checks, catching two different failures:
//
//   not-cleared    a quote reached the page without cleared:true in the
//                  manifest. This is the consent check and it is the reason
//                  this script exists.
//   drift          a quote that IS published no longer matches the source.
//                  Prose drifts: someone tidies the grammar, shortens it to
//                  fit a line, joins two halves across an ellipsis. Each of
//                  those puts words in a participant's mouth, and none of
//                  them looks wrong on the page.
//
// To publish a quote once its participant has agreed: set cleared:true in
// evals/quotes.json and put the text back on its card in public/index.html.
// Both, or this fails.
//
// Usage:
//   node scripts/verify-quotes.mjs
//   DISSERTATION=/path/to/dissertation_integrated.md node scripts/verify-quotes.mjs

import { readFileSync, existsSync } from "node:fs";

const PAGE = "public/index.html";
const MANIFEST = "evals/quotes.json";

// The source bolds the text inside every quote and uses typographic
// punctuation; the page uses neither. Normalising both to one plain form
// forgives the transcription and nothing else -- a reworded quote still
// fails, which is the point.
function norm(text) {
  return String(text)
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// An ellipsis in a quote marks speech that was elided. Each side is matched on
// its own: matching the joined string would accept a quote stitching together
// two things said minutes apart, which is the precise misquotation an ellipsis
// is supposed to disclose.
const segments = (quote) =>
  norm(quote).split("...").map((s) => s.trim()).filter(Boolean);

const failures = [];
const fail = (check, id, detail) => failures.push({ check, id, detail });

const { quotes } = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (!Array.isArray(quotes) || !quotes.length) {
  console.error(`${MANIFEST} holds no quotes`);
  process.exit(1);
}

const pageSource = readFileSync(PAGE, "utf8");
const page = norm(pageSource);

// --- the consent check ------------------------------------------------------
// Asked of the whole file rather than of the card fields, because a quote
// pasted into a paragraph, a comment or an attribute ships just the same.
for (const { id, quote, cleared } of quotes) {
  if (cleared) continue;
  const present = segments(quote).filter((part) => page.includes(part));
  if (present.length) fail("not-cleared", id, present[0]);
}

// Anything quoted on a card has to be a quote this manifest knows about, so
// adding one straight to the page is a failure rather than an unchecked claim.
const onCards = [...pageSource.matchAll(/^\s*text: "((?:[^"\\]|\\.)*)"/gm)]
  .map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
const known = new Set(quotes.map((q) => norm(q.quote)));
for (const text of onCards) {
  if (!known.has(norm(text))) fail("unpinned", "(card)", text.slice(0, 80));
}

// --- the drift check --------------------------------------------------------
// Only meaningful for quotes actually published; an uncleared one has already
// failed above.
const sourcePath = process.env.DISSERTATION;
let checkedAgainstSource = 0;
if (sourcePath && existsSync(sourcePath)) {
  const source = norm(readFileSync(sourcePath, "utf8"));
  for (const { id, quote } of quotes) {
    for (const part of segments(quote)) {
      if (!source.includes(part)) fail("drift", id, part);
    }
    checkedAgainstSource += 1;
  }
} else if (sourcePath) {
  console.error(`DISSERTATION set but not found: ${sourcePath}`);
  process.exit(1);
}

// --- report -----------------------------------------------------------------
const WHY = {
  "not-cleared": "in the shipped page but not cleared for publication",
  unpinned: "quoted on a card but not in the manifest",
  drift: "pinned but no longer matching the dissertation"
};
for (const { check, id, detail } of failures) {
  console.error(`FAIL [${check}] ${id}: ${WHY[check]}\n       ${detail}`);
}

const cleared = quotes.filter((q) => q.cleared).length;
console.log(
  `quotes pinned=${quotes.length} cleared=${cleared} onCards=${onCards.length} ` +
  `sourceChecked=${checkedAgainstSource}` +
  (sourcePath ? "" : " (set DISSERTATION to check for drift)")
);
if (failures.length) {
  console.error(`\n${failures.length} quote check(s) failed`);
  process.exit(1);
}
console.log("all quote checks passed");
