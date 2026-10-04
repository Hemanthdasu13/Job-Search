// The closing screen, held to the shape five readers demanded of it.
//
// The design came out of putting the user's hat on rather than the editor's,
// and each rule below is one reader's verdict made checkable:
//
//   Priya, 90 seconds between meetings - the long research paragraph is not
//     on the default view. It is behind a disclosure or it is nowhere.
//   Tom, a pub recommendation and no expertise - "nothing here needs fixing"
//     has to be reachable, or the tool is a hammer looking for nails.
//   Hannah, already builds reconciliations - what held comes BEFORE what is
//     exposed. Shown a fault first, she stops reading and tells people the
//     tool is not serious.
//   Dan, came off LinkedIn with no research context - the line he repeats
//     carries no term of art.
//   Marcus, who said "too complex" and is looking for a machine behind it -
//     length is the tell, so the default view is bounded, and nothing on the
//     held side may read as flattery.
//
// This checks the page's structure, not a live run. A rendered walk is in
// scripts/simulate.mjs and the browser.

import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const { STRENGTH_IDS } = await import("../api/_strengths.js");
const { PRACTICE_IDS } = await import("../api/_practices.js");

let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { console.log(`  ok  ${name}`); return; }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
};

// Hannah. Order in the DOM is the order on the screen.
const held = page.indexOf('id="s5a-held-block"');
const exposed = page.indexOf('id="s5a-exposed-block"');
check("what held comes before what is exposed", held > 0 && exposed > 0 && held < exposed,
  `held at ${held}, exposed at ${exposed}`);

// Tom.
check("there is a nothing-to-fix outcome", page.includes('id="s5a-nothing"'));

// Priya. The long research paragraph and the participant quote are both
// built inside the <details>, never appended to the card itself.
const painter = page.slice(page.indexOf("function paintExposed"), page.indexOf("function paintLedger"));
check("the research paragraph is behind a disclosure",
  /more\.appendChild\(line\("p", null, card\.why\)\)/.test(painter) && painter.includes("document.createElement(\"details\")"));
check("the participant quote is behind the same disclosure",
  /more\.appendChild\(bq\)|more\.appendChild\(line\("p", "quote-source"/.test(painter));
check("nothing on the held side opens a disclosure",
  !page.slice(page.indexOf("function paintHeld"), page.indexOf("function paintExposed")).includes("details"));

// Marcus. One gap, and the ceiling is a named constant rather than a slice
// somebody can quietly widen.
check("the screen shows one gap", /var MAX_SHOWN_GAPS = 1;/.test(page));
check("the gap list is actually capped by it", painter.includes("slice(0, MAX_SHOWN_GAPS)"));

// Dan. The repeated line is the card's own action text, already written in
// the researcher's words, so it cannot drift into a coined term.
check("the takeaway is the card's action, not new prose",
  /\$\("s5a-takeaway"\)\.textContent = PRACTICES\[show\[0\]\.id\]\.action;/.test(painter));

// Every id the server can send has somewhere to land, both ways round.
const table = page.slice(page.indexOf("var STRENGTHS = {"), page.indexOf("function strengthReady"));
const inPage = [...table.matchAll(/"([a-z-]+)":\s*\{/g)].map((m) => m[1]);
check("every strength id the server knows exists on the page",
  STRENGTH_IDS.every((id) => inPage.includes(id)),
  STRENGTH_IDS.filter((id) => !inPage.includes(id)).join(", "));
check("the page invents no strength the server cannot send",
  inPage.every((id) => STRENGTH_IDS.includes(id)),
  inPage.filter((id) => !STRENGTH_IDS.includes(id)).join(", "));

// No strength may cite the research. The screen's citation budget is two and
// the gap card spends one; beyond that, a strength that needs a count behind
// it is not true by construction, which is what these are meant to be.
const CITES = /\b(research|study|interviews?|participants?|findings?|of twelve)\b/i;
const whys = [...table.matchAll(/why:\s*"([^"]+)"/g)].map((m) => m[1]);
check("no strength cites the research", whys.every((w) => !CITES.test(w)),
  whys.filter((w) => CITES.test(w)).join(" | "));
check("every strength has a sentence written for it", whys.length === STRENGTH_IDS.length,
  `${whys.length} written, ${STRENGTH_IDS.length} slots`);

// Marcus again. A strength is work already done; one sentence says it.
const longest = whys.reduce((n, w) => Math.max(n, w.split(/\s+/).length), 0);
check("no strength runs past 25 words", longest <= 25, `longest is ${longest}`);

console.log("");
if (failed) { console.log(`${failed} check(s) failed.`); process.exit(1); }
console.log(`Ledger holds: ${PRACTICE_IDS.length} gaps, ${STRENGTH_IDS.length} strengths,`);
console.log("one gap shown, held first, the research paragraph behind a disclosure.");
