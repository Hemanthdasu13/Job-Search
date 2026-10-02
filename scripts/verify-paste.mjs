// What the paste signal may and may not fire on.
//
//   node scripts/verify-paste.mjs
//
// The page says once, lightly, when an answer arrived through a model. The
// question is what counts as evidence for that, and the answer is: markdown
// syntax in a box that renders none. Characters, not cadence.
//
// The other option was judging prose, and it is not built. "Reads like AI"
// misfires hardest on people writing in a second language, people who write
// formally, and people who write well - which is most of who this page is
// for. There is no version of telling a senior practitioner their own
// account looks machine-written, wrongly, that can be taken back.
//
// So the corpus below is weighted the way the risk is. Every human entry is
// a real answer from a contributed conversation or a plausible careful one,
// and a single false positive here fails the run. The pastes are the easy
// half.

import { readFileSync } from "node:fs";

// Pulled out of the page rather than copied, so the thing under test is the
// thing that ships. The page is inline in one HTML file the CSP forbids
// importing, which is why it comes out by extraction.
const page = readFileSync("public/index.html", "utf8");
const src = page.match(/function looksPasted\(text\) \{[\s\S]*?\n  \}/);
if (!src) {
  console.error("could not find looksPasted in public/index.html");
  process.exit(1);
}
const looksPasted = new Function(`${src[0]}; return looksPasted;`)();

// Nine of these are his own words, typed by hand, from the two conversations
// contributed through the page. The last three are the dangerous shape: long,
// careful, formal, and human.
const HUMAN = [
  "i just use it to automate some task, all decisions or recommendation are mine",
  "i used it to automate my excels, it takes lot of time to build models so i used claude code to automate modelling, it makes the dashboards etc from existing data, explicitly told not to invent etc so its doing it correctly",
  "i built these models manually and cross checked multiple times , so i verified",
  "i would not know unless lecturer said or friend said or it corrected by itself",
  "this was CRDM assignment during MBA, he knows finance, i do not know",
  "i would know since , for example graph should have some curve here or some drop etc, and if the actual model does not have it then i will know somehting is wrong",
  "i would not, i will have to verify manually which would take time or get it verified using other AI or ask it to crosscheck by itself",
  "probably business case understanding,best ways to write, prose etc",
  "nothing",
  "We used AI to compare four suppliers on unit price and lead time for a component we were resourcing. It pulled published price lists, built a comparison, and recommended we switch. I read it through, it looked right, and I put it in the paper that went to the steering group. Nobody else reviewed the underlying figures before the meeting, and the recommendation was accepted on the day.",
  "I used it for two things - drafting the summary, and checking my arithmetic. The summary went out more or less as written and I did not separately verify the figures it quoted, which in hindsight is the part I would do differently.",
  "There were three things I asked it for:\n- the price comparison\n- the lead times\n- a recommendation\nI took the first two and wrote the recommendation myself, because that part is a judgement and not a lookup."
];

const PASTED = [
  "## Supplier Comparison Analysis\n\n**Key Findings:**\n\n- Supplier A offers the lowest unit price at scale\n- Supplier B has materially shorter lead times\n- Supplier C presents concentration risk\n\n**Recommendation:** Proceed with Supplier B subject to contract review. This balances cost against delivery certainty while mitigating single-source exposure.",
  "Based on my analysis, here are the key considerations:\n\n1. **Data quality** - the inputs were drawn from published rate cards\n2. **Verification** - I cross-referenced against historical invoices\n3. **Risk** - residual exposure remains on subcontractor terms\n\nOverall the approach was sound but could be strengthened by independent validation of the underlying assumptions.",
  "| Supplier | Price | Lead time |\n|---|---|---|\n| A | low | long |\n| B | mid | short |\n\nThe comparison above summarises the position. I relied on it for the steering group paper and did not separately verify the figures against our own purchase records.",
  "# Verification Approach\n\nMy process for validating AI output follows several established principles.\n\n---\n\nFirst, I assess the provenance of the underlying data. Second, I consider whether the reasoning chain is reproducible. Third, I look for internal inconsistencies that might indicate fabrication."
];

let failed = 0;
for (const text of HUMAN) {
  if (looksPasted(text)) {
    failed++;
    console.error(`FAIL false positive on a human answer:\n       "${text.slice(0, 90)}..."`);
  }
}
for (const text of PASTED) {
  if (!looksPasted(text)) {
    failed++;
    console.error(`FAIL missed a paste:\n       "${text.slice(0, 90)}..."`);
  }
}

// The signal needs length behind it too: three bullets in a two-line answer
// is a person making a list, and on its own it never counts.
if (looksPasted("- price\n- lead time\n- delivery")) {
  failed++;
  console.error("FAIL a short hand-typed list counted as a paste");
}

console.log(`checked ${HUMAN.length} human answers and ${PASTED.length} pastes`);
if (failed) {
  console.error(`\n${failed} paste check(s) failed`);
  process.exit(1);
}
console.log("paste checks passed: characters, not cadence");
