// Every participant quote on the closing cards, checked against its source.
//
// The one promise this tool makes is that it never states a finding the model
// produced. The seventeen cards keep that promise by being written prose --
// but written prose drifts. Someone tidies a quote's grammar, shortens it to
// fit a line, joins two halves across an ellipsis. Each of those is the tool
// putting words in a participant's mouth, which is worse than a wrong
// question and is invisible on the page.
//
// Two checks, because they catch different failures:
//
//   page vs manifest      - the quote on screen is still the pinned quote.
//                           Runs always, needs nothing but the repo.
//   manifest vs source    - the pinned quote is still what the participant
//                           said. Runs when DISSERTATION points at the
//                           findings document, which is not in this repo.
//
// Usage:
//   node scripts/verify-quotes.mjs
//   DISSERTATION=/path/to/dissertation_integrated.md node scripts/verify-quotes.mjs

import { readFileSync, existsSync } from "node:fs";

const PAGE = "public/index.html";
const MANIFEST = "evals/quotes.json";

// The source bolds the text inside every quote and uses typographic
// punctuation; the page uses neither. Normalising both to the same plain form
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

// An ellipsis in a quote marks speech that was elided. Each side has to match
// on its own: matching the joined string would accept a quote that stitches
// together two things said minutes apart, which is the precise misquotation
// an ellipsis is supposed to disclose.
function segments(quote) {
  return norm(quote).split("...").map((s) => s.trim()).filter(Boolean);
}

const failures = [];
const fail = (check, id, detail) => failures.push({ check, id, detail });

const { quotes } = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (!Array.isArray(quotes) || !quotes.length) {
  console.error(`${MANIFEST} holds no quotes`);
  process.exit(1);
}

// --- page vs manifest -------------------------------------------------------
const page = norm(readFileSync(PAGE, "utf8"));
for (const { id, quote } of quotes) {
  for (const part of segments(quote)) {
    if (!page.includes(part)) fail("page", id, part);
  }
}

// Also assert the page has no card holding a quote that is not pinned here,
// so adding a card without pinning its quote is a failure rather than a
// silently unchecked claim.
const pageText = readFileSync(PAGE, "utf8");
const onPage = [...pageText.matchAll(/^\s{8}text: "((?:[^"\\]|\\.)*)"/gm)]
  .map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
const pinned = new Set(quotes.map((q) => norm(q.quote)));
for (const text of onPage) {
  if (!pinned.has(norm(text))) fail("unpinned", "(card)", text.slice(0, 80));
}

// --- manifest vs source -----------------------------------------------------
const sourcePath = process.env.DISSERTATION;
let sourceChecked = 0;
if (sourcePath && existsSync(sourcePath)) {
  const source = norm(readFileSync(sourcePath, "utf8"));
  for (const { id, quote } of quotes) {
    for (const part of segments(quote)) {
      if (!source.includes(part)) fail("source", id, part);
    }
    sourceChecked += 1;
  }
} else if (sourcePath) {
  console.error(`DISSERTATION set but not found: ${sourcePath}`);
  process.exit(1);
}

// --- report -----------------------------------------------------------------
for (const { check, id, detail } of failures) {
  const why = check === "page"
    ? "on the page but not matching the pinned quote"
    : check === "source"
      ? "pinned but not found in the dissertation"
      : "shown on a card but not pinned in the manifest";
  console.error(`FAIL [${check}] ${id}: ${why}\n       ${detail}`);
}

console.log(
  `quotes pinned=${quotes.length} onPage=${onPage.length} ` +
  `sourceChecked=${sourceChecked}${sourcePath ? "" : " (set DISSERTATION to check the source)"}`
);
if (failures.length) {
  console.error(`\n${failures.length} quote check(s) failed`);
  process.exit(1);
}
console.log("all quote checks passed");
