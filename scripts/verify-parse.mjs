// What the parser must survive.
//
//   node scripts/verify-parse.mjs
//
// This exists because of one live failure. A real conversation reached its
// third question and landed on "the interactive part is unavailable",
// reason unparseable_reply, and the log line said nothing but the model
// name - so the cause had to be guessed at from four candidates with no way
// to tell them apart.
//
// Every case below is one of those candidates, plus the ones found while
// reading the extractor. The rule the whole file is holding: a reply that
// contains a usable question must not end the conversation. The status is
// recoverable, the reflection is optional, the closing note is optional. The
// question is the only thing the next screen cannot do without.

import { extractJson, describeReply } from "../api/_model.js";

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  }
  return ok;
};

const Q = "What did you check those figures against?";
const whole = { question: Q, status: "probing", reflection: null, closing_note: null };

// 1. The shape the prompt asks for.
check("bare object", extractJson(JSON.stringify(whole)), whole);

// 2. Fenced, which the prompt forbids and models do anyway.
check("fenced", extractJson("```json\n" + JSON.stringify(whole) + "\n```"), whole);

// 3. Fenced and cut off before the closing fence. Truncation takes the
//    closing ``` first, and the old extractor required it.
check("fence left open", extractJson("```json\n" + JSON.stringify(whole)), whole);

// 4. Prose either side. Handled before, and still handled.
check("wrapped in prose",
  extractJson(`Here is the next question.\n\n${JSON.stringify(whole)}\n\nLet me know.`), whole);

// 5. Prose containing a brace. The old slice ran from the first "{" to the
//    last "}", so a brace in the surrounding sentence took the object with
//    it.
check("stray brace in the prose",
  extractJson(`Next, using the {question} format:\n${JSON.stringify(whole)}`), whole);

// 6. Two objects, the model correcting itself. The old slice read both as
//    one piece of broken JSON and returned nothing.
check("two objects, first wins",
  extractJson(`${JSON.stringify(whole)}\nActually:\n${JSON.stringify({ ...whole, question: "second" })}`),
  whole);

// 7. A trailing comma. Legal almost everywhere except JSON.
check("trailing comma",
  extractJson(`{"question": ${JSON.stringify(Q)}, "status": "probing", "reflection": null,}`),
  { question: Q, status: "probing", reflection: null });

// 8. A brace inside the question itself, so the balanced scan has to know it
//    is inside a string.
const braced = { question: "What did it have in {} for that field?", status: "probing" };
check("brace inside a string", extractJson(JSON.stringify(braced)), braced);

// 9. The truncation that matters: the question arrived whole, the object did
//    not. Everything complete is kept; the half-written field is dropped.
check("cut off after the question",
  extractJson(`{"question": ${JSON.stringify(Q)}, "status": "prob`),
  { question: Q });

// 10. Truncated mid-question. A half sentence on screen is worse than the
//     fallback, so this one is not salvaged.
check("cut off inside the question",
  extractJson('{"question": "What did you check those figures ag'),
  null);

// 11. An escaped quote inside the question, with the object truncated after
//     it. The scan must not mistake the escaped quote for the end.
check("escaped quote, then truncated",
  extractJson('{"question": "Which part of the \\"comparison\\" did you check?", "sta'),
  { question: 'Which part of the "comparison" did you check?' });

// 12. No object at all: the model answered in prose. Not recoverable, and it
//     should not pretend otherwise.
check("prose only", extractJson("I would ask what the system had to work from."), null);

// 13. Nothing. A thinking-only reply reaches the extractor as an empty string.
check("empty", extractJson(""), null);
check("null", extractJson(null), null);

// 14. An object that is not the right object. The caller rejects it on the
//     missing question, not here.
check("wrong object", extractJson('{"thought": "hmm"}'), { thought: "hmm" });

// The diagnostic. It has one job - tell the four candidate causes apart on
// the next occurrence - and one hard limit: not one word of the reply.
const shape = describeReply(
  { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "y" }] },
  "Here you go: " + JSON.stringify(whole)
);
for (const want of ["blocks=thinking+text", "stop=end_turn", "starts=prose", "ends=brace",
                    "braces=1/1", "keys=question,status,reflection,closing_note"]) {
  if (!shape.includes(want)) { failed++; console.error(`FAIL diagnostic missing ${want}\n       ${shape}`); }
}
// A thinking-only reply has to be distinguishable from a fenced one, because
// they need different fixes.
const silent = describeReply({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "x" }] }, "");
for (const want of ["blocks=thinking", "chars=0"]) {
  if (!silent.includes(want)) { failed++; console.error(`FAIL diagnostic missing ${want}\n       ${silent}`); }
}
// The one rule that is not about diagnosis: the words never go in the log.
const secret = "we were resourcing a component from four suppliers at a unit price";
const leak = describeReply({ stop_reason: "end_turn", content: [{ type: "text", text: "t" }] },
  `{"question": "${Q}", "reflection": "${secret}"}`);
for (const word of ["resourcing", "suppliers", "figures", "unit"]) {
  if (leak.includes(word)) { failed++; console.error(`FAIL the diagnostic logged "${word}"\n       ${leak}`); }
}

console.log(failed ? `\n${failed} parse check(s) failed` : "parse checks passed: a reply with a question in it survives");
process.exit(failed ? 1 : 0);
