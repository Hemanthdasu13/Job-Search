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
const { PRACTICE_IDS, validateSelection, isVerbatim } = await import("../api/_practices.js");
const { validateHeld, heldOnlySystem } = await import("../api/_strengths.js");
const { isNonAnswer: isNonAnswerOf } = await import("../api/ask.js");

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

// The questioner and the closing must agree about how much a person may write.
// They did not: the closing refused at 1500 characters an answer and 9000 a
// conversation while the questioner accepted 2000 and 20000, so a long
// conversation lost its entire ledger and fell through to the general
// closing. Nothing caught it because nothing compared them.
const askSrc = readFileSync(new URL("../api/ask.js", import.meta.url), "utf8");
const closeSrc = readFileSync(new URL("../api/close.js", import.meta.url), "utf8");
const limitOf = (src, name) => {
  const hit = src.match(new RegExp(`const ${name} = (\\d+);`));
  return hit ? Number(hit[1]) : null;
};
for (const name of ["MAX_ANSWER_CHARS", "MAX_TOTAL_CHARS", "MAX_ANSWERS"]) {
  const a = limitOf(askSrc, name), c = limitOf(closeSrc, name);
  check(`the closing accepts as much as the questioner does (${name})`,
    a !== null && c !== null && c >= a, `ask=${a} close=${c}`);
}

// The two lists that decide whether the screen may say nothing needs fixing
// have to agree. One lives in api/_strengths.js, the other in the page; a page
// that congratulates work the server did not call settled is the fault this
// pair exists to prevent.
const { STRENGTHS_THAT_SETTLE_IT } = await import("../api/_strengths.js");
const settleBlock = page.slice(page.indexOf("var SETTLES_IT = ["), page.indexOf("function strengthReady"));
const inPageSettle = [...settleBlock.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
check("the page and the server agree on which strengths settle it",
  STRENGTHS_THAT_SETTLE_IT.length === inPageSettle.length
    && STRENGTHS_THAT_SETTLE_IT.every((id) => inPageSettle.includes(id)),
  `server [${STRENGTHS_THAT_SETTLE_IT}] page [${inPageSettle}]`);

// And an admission must never settle it. A live run put "naming what it could
// not know" on screen and then said the work was checked about as hard as
// being wrong would have cost, under a conclusion line calling the headline
// figure unverified.
for (const id of ["named-the-unknowable", "chased-the-doubt", "said-what-to-exclude", "judgement-stayed-theirs"]) {
  check(`${id} does not on its own settle it`, !STRENGTHS_THAT_SETTLE_IT.includes(id));
}

// ------------------------------------------------------------------ the reply
//
// The fault these exist for. Across four live conversations the selector
// chose nine items and the server discarded every one as "not in the
// library", so every closing fell back to the general text. This suite passed
// throughout, because it checked the libraries, the limits and the page and
// never once checked what happens to a reply.
//
// Two separate failures were hiding in that one log line: an id the model
// invented, and a real id filed under the wrong list. The first is now
// impossible, because the provider enforces an enum; the second is now
// corrected rather than thrown away.
const { readReply, routeByLibrary, SELECT_FORMAT, HELD_FORMAT, SELECT_SYSTEM } = await import("../api/close.js");
const { PRACTICES } = await import("../api/_practices.js");

const quote = "I reconciled its totals back to the bank statements";
const theirs = [quote + " and our treasurer went through the formulas with me."];

{
  const r = readReply({
    gaps: [{ id: "constructed-check", quote }],
    held: [{ id: "source-outside-the-model", quote: "our treasurer went through the formulas" }]
  });
  check("the shape the schema asks for is read",
    r.selected[0] === "constructed-check" && r.evidence["constructed-check"] === quote
      && r.held[0] === "source-outside-the-model");
}

{
  // The provider may refuse the schema, in which case the prompt asks for
  // JSON and the older shape can come back. Both have to work, or a format
  // refusal empties every ledger silently.
  const r = readReply({
    selected: ["constructed-check"], evidence: { "constructed-check": quote },
    held: ["source-outside-the-model"], held_evidence: { "source-outside-the-model": quote }
  });
  check("the shape without a schema is still read",
    r.selected[0] === "constructed-check" && r.held[0] === "source-outside-the-model"
      && r.evidence["constructed-check"] === quote);
}

{
  // A strength filed as a gap. This is the predictable mistake, because the
  // prompt says the two lists are the same kind of thing read the other way.
  const { reply, moved } = routeByLibrary(readReply({
    gaps: [{ id: "source-outside-the-model", quote }], held: []
  }));
  check("a strength filed as a gap is moved, not dropped",
    moved === 1 && reply.held[0] === "source-outside-the-model"
      && reply.held_evidence["source-outside-the-model"] === quote
      && reply.selected.length === 0);
}

{
  const { reply, moved } = routeByLibrary(readReply({
    gaps: [], held: [{ id: "constructed-check", quote }]
  }));
  check("a gap filed as a strength is moved, not dropped",
    moved === 1 && reply.selected[0] === "constructed-check"
      && reply.evidence["constructed-check"] === quote
      && reply.held.length === 0);
}

{
  // An invented id stays where it was put, so the validator still rejects it.
  // The router corrects filing; it does not launder.
  const { reply, moved } = routeByLibrary(readReply({
    gaps: [{ id: "not-a-real-card", quote }], held: []
  }));
  const { kept, rejected } = validateSelection(reply, theirs);
  check("an invented id is still rejected",
    moved === 0 && kept.length === 0 && rejected[0].why === "not in the library");
  check("the rejection names the id, so invention and misfiling can be told apart",
    rejected[0].id === "not-a-real-card");
}

{
  // A moved id is not a free pass: the quote still has to be theirs.
  const { reply } = routeByLibrary(readReply({
    gaps: [{ id: "source-outside-the-model", quote: "words nobody typed" }], held: []
  }));
  const held = validateHeld(reply, theirs, isVerbatim);
  check("a moved id still has to be quoted verbatim",
    held.kept.length === 0 && held.rejected[0].why === "quote is not the person's own words");
}

{
  // One id twice, with a fabricated quote first and a real one second. The
  // map this flattens into holds one quote per id, so last-wins would let the
  // real quote carry the fabricated choice through.
  const r = readReply({
    gaps: [
      { id: "constructed-check", quote: "I built a reconciliation and found six errors" },
      { id: "constructed-check", quote: quote }
    ],
    held: []
  });
  const { kept, rejected } = validateSelection(r, theirs);
  check("a repeated id keeps the first quote, not the convenient one",
    kept.length === 0 && rejected.some((x) => x.why === "quote is not the person's own words"),
    JSON.stringify(rejected));
}

// The enum is the thing that makes an invented id impossible, so it has to
// hold every id and nothing else.
const gapEnum = SELECT_FORMAT.properties.gaps.items.properties.id.enum;
const heldEnum = SELECT_FORMAT.properties.held.items.properties.id.enum;
check("the gap enum is exactly the gap library",
  gapEnum.length === PRACTICE_IDS.length && PRACTICE_IDS.every((id) => gapEnum.includes(id)),
  `${gapEnum.length} vs ${PRACTICE_IDS.length}`);
check("the strength enum is exactly the strength library",
  heldEnum.length === STRENGTH_IDS.length && STRENGTH_IDS.every((id) => heldEnum.includes(id)));
check("the second pass is constrained to the strength library",
  HELD_FORMAT.properties.held.items.properties.id.enum.length === STRENGTH_IDS.length
    && !HELD_FORMAT.properties.gaps);
check("every enum id has a trigger written for it",
  gapEnum.every((id) => PRACTICES[id] && PRACTICES[id].trigger));

// The prompt has to ask for the shape the schema enforces. A schema asking
// for "gaps" behind a prompt asking for "selected" works only until the
// provider refuses the schema, and then empties every ledger at once.
check("the prompt asks for the key the schema enforces",
  SELECT_SYSTEM.includes('"gaps"') && !SELECT_SYSTEM.includes('"selected": ['),
  "prompt and schema must name the same keys");

// The closing's own clock has to fit inside the ceiling the platform gives
// the function, with room for the second pass. One live closing was cut off
// four milliseconds past the client's 20-second deadline and lost its whole
// ledger; the fix is only a fix while these four numbers stay in order.
const closeNum = (name) => {
  const m = new RegExp(`const ${name} = (\\d+)`).exec(closeSrc);
  return m ? Number(m[1]) : null;
};
const ceiling = Number(/"api\/close\.js":\s*{\s*"maxDuration":\s*(\d+)/
  .exec(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))?.[1]);
const budget = closeNum("BUDGET_MS"), first = closeNum("FIRST_PASS_MS"),
      second = closeNum("MIN_SECOND_PASS_MS");
check("the closing's budget leaves the platform headroom",
  Number.isFinite(ceiling) && budget !== null && budget < ceiling * 1000,
  `budget=${budget}ms ceiling=${ceiling}s`);
// Not "both passes always fit". A first pass slow enough to crowd out the
// second is the right outcome - the second only runs when both lists came
// back empty, and a slow answer that found something beats a fast rescue of
// nothing. What must hold is that a second pass which does start cannot be
// killed by the platform mid-call, because being killed loses the first
// pass's valid answer along with it: nothing has been written to the
// response yet.
check("a second pass that starts cannot be killed mid-call",
  first !== null && second !== null && first + second <= ceiling * 1000,
  `first=${first} + second=${second} vs ceiling=${ceiling * 1000}ms`);
check("the second pass ends inside the budget whenever it starts",
  second < budget, `a second pass needs ${second}ms and the budget is ${budget}ms`);

// ---------------------------------------------- the answer and its question
//
// The fault: the selector was sent the answers alone. Asked what the plan had
// assumed about her fitness that she had not told it, a visitor answered with
// a list of what she had withheld, and the selector read the list as scope she
// had set - putting "scope was part of the instruction" on the screen of
// someone who had specified nothing. The questioner, which had the questions,
// got it right in the same conversation.
const { transcriptOf } = await import("../api/close.js");
const HER = [
  "Workout plan",
  "Helped with decision fatigue. Saved some time",
  "The kind of machines available, my actual fitness levels, my work out plan prior to AI making one"
];
const HER_QUESTIONS = [
  "What did you use the plan for, and what happened once you started following it?",
  "What did the plan assume about your fitness or schedule that you didn't actually tell it?"
];
{
  const t = transcriptOf(HER, HER_QUESTIONS);
  check("each answer is paired with the question it answers",
    t.includes("Asked: What did the plan assume about your fitness")
      && t.indexOf("Asked: What did the plan assume") < t.indexOf("The kind of machines available"),
    t);
  check("the opening account is marked as unprompted",
    /\[1\] What they described, before being asked anything:\nWorkout plan/.test(t), t);
  check("a conversation with no questions still builds a transcript",
    transcriptOf(HER, []).includes("Workout plan"));
  check("more answers than questions does not misalign them",
    !transcriptOf(HER, ["only one question?"]).includes("Asked: undefined"));
}
{
  // A question can never become the evidence, because the verbatim check runs
  // against the answers alone. Structural, not a matter of the model obeying
  // the instruction that says so.
  const { reply } = routeByLibrary(readReply({
    gaps: [{ id: "constrain-the-generation", quote: HER_QUESTIONS[1] }], held: []
  }));
  const { kept, rejected } = validateSelection(reply, HER);
  check("a question quoted as their own words is rejected",
    kept.length === 0 && rejected[0].why === "quote is not the person's own words");
}
check("both prompts are told to read an answer against its question",
  SELECT_SYSTEM.includes("Read every answer as the answer to the question above it")
    && heldOnlySystem().includes("Read every answer as the answer to the question above it"));
check("the page sends the questions with the answers",
  /answers: state\.answers, questions: state\.questions/.test(page));

// No substance floor, and the reason is pinned: the restaurant conversation is
// sixty-seven words and must close, the thin one was fifty-two, and a floor
// between them is fitted to a single case. api/ask.js carries the argument.
const { conversationIsThin } = await import("../api/ask.js");
const SOHO = [
  "I was using it to recommend me for a restaurant/ pub near soho",
  "i cannot weigh, im new to the place. but i asked someone after and they said yeah its a cool place",
  "Something only a local would know, his own lived experience and the vibe on that day.",
  "He had been there the week before, which is why I asked him rather than anyone else."
];
check("the restaurant conversation is never called thin", !conversationIsThin(SOHO));
check("a conversation of refusals still is",
  conversationIsThin(["I used it for a script.", "nothing lol", "no idea", "i would look silly"]));

// ------------------------------------------------- when the log is written
//
// The contribution has to be sent after the selection resolves, not before.
//
// It was sent one line above the selectPractices() call, so the shown field -
// added for the single purpose of recording which cards a closing rendered -
// read {gaps:[],held:[]} on every conversation it was ever attached to. Four
// runs logged it. I read those four as a selector that had chosen nothing,
// and wrote that down as the open fault; it had chosen nine things and the
// server had discarded all nine for a different reason entirely. A field that
// cannot be anything but empty is worse than no field, because it is read.
const closeFn = page.slice(page.indexOf("function closeGapSurfaced"),
                           page.indexOf("function closeVerified"));
const atSelect = closeFn.indexOf("selectPractices()");
// Every contribute() ahead of the selection call, by where it starts. Counted
// rather than pattern-matched on its argument: the call this is here to catch
// passed a nested ternary, and a regex written to recognise that one argument
// would not recognise the next one written.
const early = [...closeFn.slice(0, atSelect).matchAll(/\bcontribute\s*\(/g)]
  .map((m) => closeFn.slice(m.index, closeFn.indexOf(";", m.index)));
check("the gap closing does not log before the selection comes back",
  // Exactly one, and its argument the bare literal: the only ending that may
  // be logged before the selection is the one on the path that never selects,
  // because the page falls straight to the fixed text when the interactive
  // part is away and there is no ledger to wait for. A ternary here is the
  // bug itself - it was `contribute(unavailable ? "unavailable" : ...)`, which
  // mentions the word while logging every other ending too early.
  early.length === 1 && /^contribute\(\s*"unavailable"\s*\)$/.test(early[0].trim()),
  early.length ? `runs before selectPractices(): ${early.map((c) => c.trim()).join(" | ")}`
               : "nothing contributes on the unavailable path");
check("the gap closing logs once the selection has resolved",
  /selectPractices\(\)[\s\S]*contribute\(ending\)/.test(closeFn));
check("a failed selection still contributes the conversation",
  (closeFn.match(/contribute\(ending\)/g) || []).length === 2,
  "both arms of the then() must send it");
check("the ledger records which closing was on the screen",
  /ledger:\s*!!state\.ledger/.test(page) && /nothing:\s*!!state\.nothing/.test(page));
check("the server keeps those two flags",
  closeSrc !== null && readFileSync(new URL("../api/contribute.js", import.meta.url), "utf8")
    .includes("body?.shown?.ledger === true"));

console.log("");
if (failed) { console.log(`${failed} check(s) failed.`); process.exit(1); }
console.log(`Ledger holds: ${PRACTICE_IDS.length} gaps, ${STRENGTH_IDS.length} strengths,`);
console.log("one gap shown, held first, the research paragraph behind a disclosure.");
