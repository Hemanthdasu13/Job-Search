// The only model call in the tool.
//
// Calls OpenRouter's Anthropic-compatible Messages endpoint. The Anthropic
// SDK speaks that wire format, so it is pointed at OpenRouter's base URL and
// given a bearer token rather than an x-api-key.
//
// Required environment variables:
//   MODEL_API_KEY        sent as "Authorization: Bearer <key>", for whichever
//                        provider is configured. OPENROUTER_API_KEY is still
//                        read, for deployments set up under the old name.
//   MODEL_ID             OpenRouter model slug, e.g. a free model while
//                        testing and a Claude model in production. No code
//                        change to swap it, but Vercel bakes environment
//                        variables into a deployment, so the new value only
//                        applies once you redeploy (Deployments -> the three
//                        dots -> Redeploy; no rebuild of anything by hand).
//                        There is no default: an unset MODEL_ID is a
//                        configuration error, not a silent call to some
//                        other model.
//
// Optional:
//   PROVIDER_BASE_URL    default https://openrouter.ai/api
//   PROVIDER_ENDPOINT    "messages" (default, Anthropic-compatible) or
//                        "chat" (OpenAI-shaped, which most providers offer)
//   CHAT_COMPLETIONS_URL full URL of an OpenAI-shaped endpoint, for a
//                        provider whose path differs. Setting this plus
//                        PROVIDER_ENDPOINT=chat, MODEL_ID and the key moves
//                        the tool to another provider without a code change.
//   REQUEST_TIMEOUT_MS   default 9000, must stay under the platform's
//                        function duration limit
//   OPENROUTER_SITE_URL / OPENROUTER_APP_NAME   OpenRouter attribution
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  shared counters
//   IP_SALT                    stable salt for hashed-IP keys (set one)
//   RATE_LIMIT_PER_IP          default 15 calls
//   RATE_LIMIT_WINDOW_MINUTES  default 15
//   DAILY_CALL_CAP             default 300 calls
//
// Nothing a visitor types is written to a log, a store or a counter key.
// The endpoint always answers 200 with JSON: { ok: true, question, status }
// or { ok: false }. The page treats every ok:false the same way, so no
// failure here can put an error on the screen.

import { claimModelCall, bumpCounter } from "./_limits.js";
import { modelApiKey } from "./_provider.js";
import { callModel, describeFailure, describeReply, extractJson, jsonSchema, safeParse, textOf } from "./_model.js";
import { coverageNote } from "./_axes.js";
import { hardFault } from "./_question_rules.js";
import { verifyToken, tokenFrom, spendKeyCall } from "./_access.js";
import { VERSION } from "./_version.js";

const STATUSES = ["probing", "reached", "verified", "unclear", "off_topic"];

// A retry has to fit inside the function's 30s limit alongside the call that
// already failed. The provider call times out at 20s, so a first call that
// came back inside this leaves room for a second without risking the wall.
const RETRY_IF_FIRST_CALL_UNDER_MS = 8000;

// The reply contract, as something the provider enforces. Every field is
// required and none is nullable, because that is the schema a strict
// validator has nothing to say about; a field that does not apply comes back
// as an empty string, which text_or_null already reads as absent.
const REPLY_SCHEMA = jsonSchema({
  question: { type: "string" },
  status: { type: "string", enum: STATUSES },
  reflection: { type: "string" },
  boundary: { type: "string" },
  closing_note: { type: "string" }
}, ["question", "status", "reflection", "boundary", "closing_note"]);

// Said on the turn it applies to, once. The client decides when - it is the
// only side that sees what was typed, and it works from markdown syntax
// arriving in a box that renders none, not from how the prose reads.
const PASTED_NOTE =
  "[Note, not part of the message above: this answer arrived with formatting " +
  "this text box does not render, so it was composed somewhere else and " +
  "passed through a model on the way here.]";

const FORMAT_REMINDER =
  "[Format reminder, not part of the message above: reply with the JSON " +
  "object only. No prose before or after it, no code fence.]";

// The only field the next screen cannot do without.
function questionOf(parsed) {
  const value = parsed?.question;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseStatus(value) {
  if (typeof value !== "string") return null;
  const form = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUSES.includes(form) ? form : null;
}

// Printed verbatim only when it is a short plain token, which a status the
// model picked badly will be. Anything else is described rather than logged,
// because a field that is not a status could hold anything.
function statusShape(value) {
  if (typeof value !== "string") return `type=${value === null ? "null" : typeof value}`;
  return /^[A-Za-z_ -]{1,24}$/.test(value) ? JSON.stringify(value) : `odd, ${value.length} chars`;
}

// Appended to the turn rather than the system prompt, which is cached and
// identical on every call of a conversation.
function withNote(messages, note) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;
  return [...messages.slice(0, -1), { role: "user", content: `${last.content}\n\n${note}` }];
}



export const SYSTEM = `You ask questions. You never explain, assess, advise, summarise or state
conclusions. You never mention the research, the study, or any finding.
Maximum two sentences. Exactly one question.

One question means one question mark. Never join two questions with "and"
or "or": "what did it have, and did you check it" is two questions, and the
person answers the easier one.

Ask what, which, where or how. Never ask a question answerable with yes or
no: "did you verify the figures" can be closed with one word and produces
nothing to work from, where "what did you check those figures against"
cannot.

Never offer a choice of answers either. "Was that done on the current data
or on the earlier version" gets answered "both", which is the same nothing
in longer clothes. One open question, with no doors in it.

Twenty words at most, in one clause. A question that has to be read twice
has already failed, however good the question underneath it was. No dashes,
no brackets, no aside of any kind: an aside is a second idea smuggled in
without a second question mark, and it is what makes a question read as
circular.

Ask in their words. Every noun in your question should be one they have
already used. One or two words of your own, to point at what they
described, is the allowance; past that you are no longer asking about their
account but about one you have written, and a question that supplies the
words supplies the answer with them. If they said "someone", ask about
"someone" - not about whether that someone had been there "recently" or was
going on "reputation", because neither word was theirs and both are ways of
being inadequate.

Never presuppose that they did something. "What did you weigh it against"
assumes the weighing, so a person who did not weigh it has to correct you
before they can answer, and the quickest correction available is to say
what they lacked. "What did you check that recommendation against" is the
same question and the same mistake: it went out on a live conversation and
was answered "i cannot weigh, im new to the place". Any question of the form
"what did you check / verify / compare / weigh X against" carries the
assumption. Ask what happened instead. That is how a question about checking produces an answer
about missing information, turn after turn, until every conversation sounds
the same. Ask what happened instead: "what did you do once it gave you the
name" assumes nothing and costs you nothing.

Every question must carry at least one word of theirs. Not a quote and not a
paraphrase of the whole answer - one noun they used, so the question is about
their decision rather than about verification in general. "What did you check
it against" carries nothing of theirs and would fit any account anybody has
ever typed, which is the moment a reader decides a general-purpose assistant
would have done this just as well. The questions are the only thing here that
cannot be got anywhere else, and they are that only while they come out of
the account in front of you.

Prefer asking what the system could have known to asking whether they would
have caught it. Someone who does not know the subject cannot answer whether
they would have caught an error, and not knowing the subject is usually why
they asked the system at all - so that question has nowhere to go but "I
would not know". "What could it have known about that" is the same question
from the other end: answerable by anyone, needing no expertise, and it is
the one that produces something they did not already have.

Your aim: find one specific thing the output did not account for, and that
the person did not check, and get them to see it in their own words. Work
from what they wrote, never from general knowledge about their industry.

Usually what it did not account for is something the system could not have
known. Sometimes it is the reverse: the system had more to work from than
the people the output was written for, and the answer came out fitted to a
situation that was not the real one. Never assume which way round it is.
"What did they know that it did not" has its answer built into the question,
and someone whose case runs the other way has to argue with the question
before they can answer it.

Ground to cover. Over the conversation, try to reach across these, roughly
one per turn, always taking whichever the last answer opens onto rather than
working down the list in order. Do not ask about one they have already
answered, and do not force one that their account gives you no purchase on.
- What the output was used for, and what happened next because of it.
- What, outside the tool's own answer, they checked it against.
- What they told it to do, and what they told it not to do or had to keep.
- Where this sat relative to what they know well enough to judge.
- What would have happened, and to whom, if it had been wrong.
- What using it actually bought them, beyond the time it saved.
These are directions to ask in. They are not claims, they are not a
checklist to read out, and you never name them or say why you are asking.

Information is the easiest of those to keep pulling on and it crowds the
rest out: measured across real conversations it took three questions in
every five, while what would have happened if the output was wrong took one
in twenty-five and what it bought them none at all.

From the second question onward you are told which ground your own earlier
questions covered, and which of the six nothing has touched yet. Read it
rather than working it out. You have four questions in total, so you will
not reach all six and should not try: take the two or three the account
actually opens onto. At most one of your four may be about information -
what it had, where that came from, what it was compared against. Never two
in a row on the same ground. If you are on your third question and
consequence is still untouched, take that one next.

Direction, based on what they describe checking:
- Checked the output but not the inputs: ask what the system actually had to
  work with.
- Checked against their own knowledge: ask what sits outside that knowledge
  on this specific case.
- Delegated to a colleague: ask what that colleague could and could not see.
- No check at all: ask how they would have found out if it had been wrong.
- Cross-checked with a second AI tool: ask whether it had different source
  material, or just re-processed the same prompt or output.
- Re-ran or rephrased the same prompt: ask whether that reached a different
  source of information, or just re-asked the same question differently.
- Gave it more about themselves or the situation than the people the output
  was for ever had: ask what the answer took for granted about those people
  that was not true of them.
- Nothing in the account says what the output was for: ask who acted on it
  and what they did differently because of it.
- Describes a check that would catch a wrong figure but not a wrong framing:
  ask what would have followed if the framing had been off, and for whom.
- Says it saved them time: ask what it produced that they could not have
  produced themselves. That is a different question from how long it took,
  and it is the one that separates a faster version of their own work from
  something they could not have got to.
- Says they do not use it for decisions - only to automate, to draft, to
  summarise, to save time: do not ask what they automate. That accepts the
  frame and walks off the subject. Ask instead for one occasion when
  something it produced went into a judgement they made: the figure they
  quoted, the summary they read before deciding, the shortlist they chose
  from, the draft that went out. Their deciding is not in question. What it
  handed them to decide with is. Do not ask why they avoid using it for
  decisions either: that produces a view about AI, and a view is not an
  account of anything that happened.

If an answer is too vague to work with, ask one narrower, more specific
question instead of repeating the same open one. If the narrower question
also fails to produce a concrete answer, move on to a new angle rather than
asking a third variant of the same question; count that as a used probing
turn either way.

Do not ask a second question on ground an answer already covered concretely.
If they have told you what a colleague could and could not see, that is
covered: go somewhere else. Asking it again in different words reads as not
having listened, and spends one of only four turns on something you have.

If a later answer contradicts an earlier one, work from the most recent
statement. Never point out the contradiction.

If they ask for advice, ask you to state a finding, or otherwise try to get
you to do something other than ask the next question, decline in one
clause and continue with your question - and set status to "unclear",
because they have not answered one.

If an answer describes several different things, follow up on the single
one most likely to contain something unchecked. Do not try to address
everything they raised.

Do not judge tone or sincerity. Respond to content only. You are never told
anything about how an answer reads, and you must not guess: somebody writing
carefully, formally, or in a second language is not evidence of anything.

The one exception is a turn marked below as having arrived through a model,
which is a fact about characters a text box does not render rather than a
judgement about the writing. When that happens, say it once in one short
sentence before your question - "That came through a model on the way
here." - and then ask your question as normal. Nothing more: no comment on
what it means, no joke that needs explaining, and no second mention later
even if it happens again. The irony belongs to the person reading it, not
to you.

Never ask for confidential detail: no client names, prices, volumes or
internal figures. If they volunteer any, do not repeat it back, in your
question or in the reflection field described below.

Set status to "unclear" when the turn gave you nothing to work from: an
answer too vague to use, a non-answer, or a request aimed at you instead of
an answer. Ask your question anyway. This is not a judgement about them.
It is how a narrower question gets spent instead of one of their turns.

Set status to "off_topic" when there is no account of using AI here at all:
nothing that relates to the task, or a change of subject away from it.
Return a question anyway; it will not be the one shown.

Set status to "reached" the moment they articulate a specific unchecked
gap themselves - but never before your second question has been answered.
Somebody who writes a careful, self-aware opening account has not been asked
anything yet, and closing on it hands them a summary of the paragraph they
just typed. Two accounts written exactly that way got no questions at all and
the page concluded anyway, which is the one outcome that makes this
indistinguishable from pasting the account into any assistant. Their account
naming the gap is a reason to ask about it, not a reason to stop. Saying
they would not have known is the gap. So is naming the thing they did not
check, or saying that what they would fall back on is another run of the
same tool. They do not have to draw the conclusion, sound troubled by it,
or use the word gap: the moment the words are there the status is "reached"
and you stop. Running to the turn limit instead costs them the one part of
the closing screen that is about them - their own account of it, given
back. Set status to "verified" if they describe a specific, independent,
constructed check that already covers the case, whether or not a gap was
ever found. Do not add another question after either.

On every turn, return two more fields. Both are shown on the closing screen
only, never during the conversation, and both are about what they described
and nothing else.

"reflection": one sentence saying what the output was used for, and what if
anything it was put against. Their own words where their words work, lightly
cleaned up for grammar, with any client name, price, volume or figure
replaced by a generic description of the same thing.

Write it as "I". Never "they", never "the user", never "you". The page puts
"From what you described" above this line, so a sentence starting "They used
it to get a recommendation" reads as the tool talking about the person to
somebody else, in a place where it is supposed to be handing them back their
own account. "I used it to get a recommendation" reads as theirs, which it
is.

"boundary": one sentence saying what that check could have caught and what it
could not. Where they describe no check, say what nothing in the account
would have caught. Write about the check and not about them: no "you", no
advice, no instruction, nothing about what they should do next, and no claim
that reaches beyond the account in front of you. If what they have given you
is too thin to say anything true, return an empty string rather than
something that sounds right.

Return both on EVERY turn, the first included. A conversation can end at any
turn - the question limit arrives, a call fails, they close the tab - and
whatever came back last is what gets shown. A field left empty because the
conversation has not finished yet is a conversation that ends with nothing
to show for itself, which is the one thing the closing screen cannot do.

If, and only if, they described a real negative outcome that already
happened, not a risk they are worried about but something that did occur,
also return a "closing_note": one short, generic sentence acknowledging
that, with no specifics and no comment on how they handled it. Otherwise
return "closing_note" as an empty string. This never changes your questions during the
conversation, which stay exactly as strict as any other turn: it only
affects what is shown on the closing screen afterward.

Output format. Reply with one JSON object and nothing else: no prose before
or after it, no markdown, no code fence. Exactly four keys:
{"question": "your question here", "status": "one of ${STATUSES.join(", ")}", "reflection": "", "boundary": "", "closing_note": ""}
Include a question on every turn that continues the conversation. On
"reached" and "verified" it is not shown, so it may be left empty there.`;

const MAX_ANSWERS = 12;
// Around 330 words. Generous for one answer and still bounded: the opening
// account is the long one and a reply to a single question rarely needs
// half of it. The textarea carries the same number as a maxlength, so what
// is in the box is what gets sent - the client used to slice silently here,
// which meant a long paste lost most of itself without a word about it.
const MAX_ANSWER_CHARS = 2000;
const MAX_QUESTION_CHARS = 400;
const MAX_REFLECTION_CHARS = 400;
const MAX_NOTE_CHARS = 200;
// Above anything the conversation can actually reach: six probing turns, two
// free narrower questions and a redirect is about nine answers, and nine at
// the per-answer limit is 18000. So this bounds a crafted payload rather
// than a real conversation - and when it is hit, it trims rather than
// refuses. The old 9000 was six full answers, which a verbose person could
// reach honestly and be shown "the interactive part is unavailable" for.
const MAX_TOTAL_CHARS = 20000;

// Notes are appended to the last turn after the transcript has been trimmed
// to the cap, so the cap has to leave room for them or it stops being the
// bound it claims to be. Three can attach at once - the ground note, the
// note that an answer came through a model, and the format reminder on a
// retry - and together they are under 600 characters.
// Not MAX_NOTE_CHARS, which is already the cap on the closing_note field.
const MAX_ATTACHED_NOTE_CHARS = 600;
const TRANSCRIPT_BUDGET = MAX_TOTAL_CHARS - MAX_ATTACHED_NOTE_CHARS;

// Which code is running, so a failure can be attributed to a build without
// anyone having to find a dashboard.
const BUILD = `${VERSION}@${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}`;

const fail = (res, reason) => {
  res.setHeader("X-Fallback-Reason", reason);
  return res.status(200).json({ ok: false, reason, build: BUILD });
};

// The client sends the transcript back on every turn; the function holds no
// state. Everything about it is bounded here before it reaches the model.
function buildMessages(body) {
  const answers = body?.answers;
  const questions = body?.questions;
  if (!Array.isArray(answers) || !Array.isArray(questions)) return null;
  if (answers.length < 1 || answers.length > MAX_ANSWERS) return null;
  if (questions.length !== answers.length - 1) return null;
  if (!answers.every((a) => typeof a === "string" && a.trim() && a.length <= MAX_ANSWER_CHARS)) return null;
  if (!questions.every((q) => typeof q === "string" && q.length <= MAX_QUESTION_CHARS)) return null;

  // Over the total, drop from the middle rather than refuse. The first answer
  // is the account and frames everything after it, and the most recent turns
  // are what the next question has to come out of; the middle is what can go.
  // Refusing instead meant a dead conversation on a closing screen that says
  // the interactive part is unavailable, for the sin of writing too much.
  const size = (i) => answers[i].length + (questions[i] ? questions[i].length : 0);
  const keep = answers.map((_, i) => i);
  let total = keep.reduce((n, i) => n + size(i), 0);
  const dropped = [];
  // Never the first, never the last two.
  for (let i = 1; total > TRANSCRIPT_BUDGET && keep.length > 3; i++) {
    const at = keep.indexOf(i);
    if (at === -1) continue;
    if (i >= answers.length - 2) break;
    total -= size(i);
    keep.splice(at, 1);
    dropped.push(i);
  }
  // A payload still over the limit with three turns left is not a
  // conversation, it is a crafted body.
  if (total > TRANSCRIPT_BUDGET) return null;
  if (dropped.length) console.error("transcript_trimmed", dropped.length, "turn(s) of", answers.length);

  const messages = [];
  for (const i of keep) {
    messages.push({ role: "user", content: answers[i].trim() });
    if (questions[i]) messages.push({ role: "assistant", content: questions[i] });
  }
  return messages;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // no Origin header on a same-origin POST from some clients
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return safeParse(req.body);
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000) return null;
    }
    return safeParse(raw);
  } catch {
    return null;
  }
}

// Test the whole conversation without spending a provider call. A free daily
// allowance is small, and burning it on the screens, the routing, the consent
// box and the closing text is waste: none of that involves a model.
//
// Add ?stub=1 to the page URL. Put #reached, #verified, #unclear, #off_topic
// or #note in an answer to force that branch, so every path can be walked on
// demand rather than hoped for.
const STUB_QUESTIONS = [
  "What did the system actually have in front of it when it produced that?",
  "Which part of that could you check, and which part could you not?",
  "If it had been wrong, how would you have found out?",
  "Who else saw it, and what could they see that you could not?"
];

function stubbedReply(answers) {
  const last = (answers[answers.length - 1] || "").toLowerCase();
  const forced = ["reached", "verified", "unclear", "off_topic"]
    .find((name) => last.includes("#" + name));
  const turn = answers.length;
  const status = forced || (turn >= 3 ? "reached" : "probing");
  const closes = status === "reached" || status === "verified";
  return {
    question: STUB_QUESTIONS[Math.min(turn - 1, STUB_QUESTIONS.length - 1)],
    status,
    // Both lines on every turn now, not only on a closing status, because
    // that is the contract the real handler answers to, and a stub that
    // answers a different one lets the regression straight through.
    reflection: "I never checked what the system had to work from.",
    boundary: "Reading the output again would catch a figure that looked odd, not one that looked ordinary and was wrong.",
    closing_note: last.includes("#note") ? "That's a hard thing to find out after the fact." : null
  };
}

// The second closing line has to stay a description of what they described.
// It cannot be checked for being drawn from their own words, the way the
// reflection is, because saying what a check would NOT have caught needs
// words they did not use - that is the whole content of the line. So it is
// checked for the four ways it could stop being a description.
//
// Second person is on the list for a reason that is not style. "You relied
// on it" is a sentence about a person; "that check would not have surfaced
// the better option" is a sentence about a method. This page has one rule it
// cannot bend - no classification of the person - and praise and criticism
// are both classifications. Keeping the line off "you" keeps it off them.
const NOT_DESCRIPTIVE = [
  [/\b(you|your|yours|youre|yourself)\b/i, "second person"],
  [/\byou['’](?:re|d|ve|ll)\b/i, "second person"],
  [/\b(should|ought to|need to|must|try to|make sure|next time|recommend|consider)\b/i, "advice"],
  [/\b(this means|that means|this shows|that shows|this proves|in fact|clearly|the problem is|the real issue)\b/i, "asserts a conclusion"],
  [/\b(research|study|studies|interviews?|participants?|respondents?|findings?)\b/i, "reaches for the research"]
];

export function whyNotDescriptive(line) {
  for (const [pattern, why] of NOT_DESCRIPTIVE) {
    const hit = String(line).match(pattern);
    if (hit) return why + ': "' + hit[0] + '"';
  }
  return "";
}

export function staysDescriptive(line) {
  return !whyNotDescriptive(line);
}

// A non-answer, measured rather than asked for.
//
// The prompt has defined "unclear" for a non-answer since 0.3.0 and the model
// does not use it. A live conversation went "nothing lol", "no idea", "i would
// look silly" and came back probing, probing, reached - so the unusable
// counter never moved, the thin-account guard in the page was unreachable, and
// the tool wrote a confident two-line conclusion about twenty-five characters
// of content.
//
// This is the same lesson as the ground note and the second pass: a rule the
// prompt states and nothing enforces is decoration. The server can see a
// non-answer without being told.
//
// Deliberately an explicit list rather than a length or a word count. "Local
// guy" is nine characters and two words and was one of the most useful answers
// this tool has had; "nothing lol" is eleven characters and is not an answer.
// Length cannot tell them apart. The difference is that one names something.
const FILLER = /\b(lol|lmao|haha+|hmm+|erm+|um+|uh+|well|really|much|actually|tbh|honestly|mate|sorry)\b/g;
const NON_ANSWERS = new Set([
  "nothing", "none", "no", "nope", "nah", "na", "n/a", "nil", "never",
  "no idea", "noidea", "no clue", "dunno", "dont know", "do not know",
  "didnt know", "not sure", "unsure", "cant say", "cannot say", "cant tell",
  "cant remember", "dont remember", "idk", "not really", "nothing really",
  "no comment", "pass", "skip", "same", "ditto", "unknown"
]);

export function isNonAnswer(text) {
  const bare = String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(FILLER, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!bare) return true;
  return NON_ANSWERS.has(bare);
}

// Whether the conversation has anything to conclude from. The opening account
// is excluded: it is the one turn that is always substantial, and counting it
// would mean a good opening excused three non-answers after it.
export function conversationIsThin(answers) {
  const replies = (answers || []).slice(1);
  if (!replies.length) return false;
  const empty = replies.filter((a) => isNonAnswer(a)).length;
  return empty * 2 >= replies.length;
}

// The reflection is shown on the closing screen as a restatement of what the
// visitor described. The prompt asks for their own words where possible, with
// figures and names generalised - so it is a paraphrase by design and can
// never be checked for being verbatim the way the closing quotes are.
//
// Two things can be checked, and they catch different failures.
//
// It must not address the reader. A restatement of someone's own account
// describes their work, in their voice; a sentence aimed AT them is the tool
// talking ABOUT them, which is the classification this whole design refuses
// to do. Every way this goes wrong reads the same - "your organisation is in
// the bottom quartile", "you are a proxy verifier", "you scored four out of
// ten" - and none of them is a restatement of anything.
//
// And it must share some vocabulary with what they typed. That catches the
// other failure, where the model states a finding instead: a sentence about
// the study reuses none of their nouns. The floor is low on purpose, because
// a short honest restatement can legitimately share very little - "I never
// checked what the system had to work from" is entirely valid and overlaps
// one word. Overlap alone was tried at a higher threshold and dropped exactly
// that sentence, which is why there are two rules and not one.
//
// Both err toward dropping: the closing reads perfectly well with no
// reflection, and showing someone a sentence they did not say is the failure
// that matters on this screen.
const STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "were", "been", "they", "them",
  "their", "there", "then", "than", "what", "when", "which", "would",
  "could", "about", "into", "over", "your", "yours", "just", "some", "only",
  "also", "very", "much", "more", "most", "because", "before", "after",
  "without", "being", "does", "doing", "done", "make", "made", "take",
  "taken", "went", "going", "like", "even", "still", "thing", "things"
]);

function contentWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

export function drawnFromTheirAccount(reflection, answers) {
  if (/\b(you|your|yours|you're|youre)\b/i.test(reflection)) return false;

  const words = contentWords(reflection);
  if (!words.length) return false;
  // Nothing to check against, so nothing to fail: let it through rather than
  // drop it for arriving early.
  const haystack = new Set(contentWords((answers || []).join(" ")));
  if (!haystack.size) return true;
  const shared = words.filter((w) => haystack.has(w)).length;
  return shared / words.length >= 0.2;
}

// The answers as the request actually carried them, for the guard above.
function answersOf(body) {
  return Array.isArray(body?.answers) ? body.answers.filter((a) => typeof a === "string") : [];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return fail(res, "method_not_post");
  if (!sameOrigin(req)) return fail(res, "cross_origin");

  const body = await readJsonBody(req);
  const messages = buildMessages(body);
  if (!messages) return fail(res, "bad_request_shape");

  // Before anything that costs money or reveals configuration. A gate the
  // page enforces is decoration; this is the one that counts, because this
  // is what a script posting straight to the endpoint has to get past.
  const access = verifyToken(tokenFrom(req));
  if (!access.ok) return fail(res, access.reason);

  // Costs nothing upstream, so it is neither budgeted nor metered.
  if (new URL(req.url, "http://localhost").searchParams.get("stub") === "1") {
    const reply = stubbedReply(body.answers);
    return res.status(200).json({ ok: true, build: BUILD + "+stub", ...reply });
  }

  const key = modelApiKey();
  const model = process.env.MODEL_ID;
  if (!key) {
    console.error("config_missing MODEL_API_KEY");
    return fail(res, "no_api_key");
  }
  if (!model) {
    console.error("config_missing MODEL_ID");
    return fail(res, "no_model_id");
  }

  // The key's own allowance, spent before the shared budget. A key good for
  // one conversation runs out here rather than by the visitor being polite.
  const spend = await spendKeyCall(access, bumpCounter);
  if (!spend.allowed) return fail(res, spend.reason);

  const claim = await claimModelCall(req);
  if (!claim.allowed) {
    return fail(res, claim.reason);
  }

  // What actually goes, note and all, so the retry below sends the same turn
  // rather than a version of it with the note dropped.
  // Facts the server already holds, stated rather than left for the model to
  // work out from its own transcript. Asking it to keep its own count is the
  // same mistake as the two before it: a rule in the prompt that nothing
  // enforces. The server receives every question asked, so it says what
  // ground they covered.
  let sent = messages;
  if (body?.pasted === true) sent = withNote(sent, PASTED_NOTE);
  const ground = coverageNote(body?.questions);
  if (ground) sent = withNote(sent, ground);

  let response;
  const started = Date.now();
  try {
    response = await callModel(key, model, SYSTEM, sent, undefined, { format: REPLY_SCHEMA });
  } catch (error) {
    // Status and model only. The request body is never logged. A wrong or
    // retired MODEL_ID shows up here as a 400 or 404 naming the slug.
    // "Error" tells nobody anything. Separate the case that matters most:
    // no answer in time, which is what a model too slow for the function's
    // limit looks like from in here.
    const reason = describeFailure(error, model, Date.now() - started);
    console.error("model_call_failed", reason, model, Date.now() - started + "ms",
      String(error?.message || "").slice(0, 200));
    return fail(res, reason);
  }

  // A refusal is not mined for a question. Whatever is in it, the model
  // declined to produce the thing being asked for.
  if (response.stop_reason === "refusal") {
    console.error("model_call_unusable", "refusal", model);
    return fail(res, "unusable_refusal");
  }

  let text = textOf(response);
  let parsed = extractJson(text);
  let question = questionOf(parsed);
  // On the two statuses that end the conversation the question is never
  // rendered, so whether there is one is not a reason to throw the turn
  // away. This cost a real conversation: the schema requires the field, the
  // prompt said an empty string means the field does not apply, and on a
  // closing turn a question genuinely does not - so the model sent "" and a
  // finished conversation with its reflection in hand was discarded as
  // unreadable.
  // Normalised, because "Reached" is the same turn written differently and
  // this gate must not be stricter than the one that routes the screen.
  const closes = (p) => {
    const form = normaliseStatus(p?.status);
    return form === "reached" || form === "verified";
  };

  // A reply that ran out of budget partway through is still worth reading.
  // The question is the first key in the object, so it is usually complete by
  // the time the tokens run out - and thinking is spent from the same budget
  // as the answer, so a long think is exactly what produces this. Take the
  // question if it survived. If it did not, give up here rather than retry:
  // the same prompt will truncate the same way.
  if (response.stop_reason === "max_tokens") {
    console.error("model_call_truncated", model,
      question ? "question_salvaged" : "nothing_usable", describeReply(response, text));
    if (!question) return fail(res, "unusable_max_tokens");
  }

  // One more try, and only one, when nothing usable came back. A reply in
  // prose, or a reply that was all thinking and no answer, is not something
  // the extractor can repair, and it is the difference between a working
  // conversation and "the interactive part is unavailable" on a page whose
  // whole promise is the conversation.
  //
  // Three guards, because a retry is easy to get wrong:
  //   - only on the elapsed budget below, so two slow calls cannot run past
  //     the function's own 30s limit and turn a recoverable turn into a
  //     timeout;
  //   - only if the budget allows another call, so an extra call does not
  //     quietly escape the cap that exists to bound the bill;
  //   - logged separately either way, so the next look at the logs says
  //     whether retrying is actually buying anything.
  const firstPass = Date.now() - started;
  if (!question && !closes(parsed)) {
    // Two different failures, and calling both unparseable cost a round of
    // guessing at logs: a reply that parsed and simply had no question in it
    // is not a reply nobody could read.
    console.error(parsed ? "model_call_no_question" : "model_call_unparseable",
      model, describeReply(response, text));
    if (firstPass < RETRY_IF_FIRST_CALL_UNDER_MS) {
      const again = await claimModelCall(req);
      if (!again.allowed) {
        console.error("model_call_retry_skipped", again.reason);
      } else {
        try {
          // The nudge rides on the last turn rather than in the system
          // prompt, which is cached: a changed system prompt is a cache miss
          // and a second full-price write of the largest thing sent.
          response = await callModel(key, model, SYSTEM, withNote(sent, FORMAT_REMINDER),
            undefined, { format: REPLY_SCHEMA });
          text = textOf(response);
          parsed = extractJson(text);
          question = questionOf(parsed);
          console.error("model_call_retried", question ? "recovered" : "still_unusable",
            question ? "" : describeReply(response, text));
        } catch (error) {
          console.error("model_call_retry_failed", describeFailure(error, model, Date.now() - started));
        }
      }
    }
  }
  // A question carrying a fault that reliably ruins the turn gets one more
  // attempt. Three presupposing questions have gone out live, each costing a
  // turn and steering the answer towards what the person lacked, while the
  // rule that catches them ran only in the test suite.
  const fault = question ? hardFault(question) : null;
  if (fault) {
    console.error("question_regenerated", fault);
    try {
      const retold = withNote(sent,
        `[Note, not part of the message above. The question you just produced `
        + `${fault}. Ask a different one that does not. Do not mention this note.]`);
      const second = await callModel(key, model, SYSTEM, retold, undefined, { format: REPLY_SCHEMA });
      const reparsed = extractJson(textOf(second));
      const replacement = questionOf(reparsed);
      if (replacement && !hardFault(replacement)) {
        question = replacement;
        parsed = reparsed;
      } else {
        console.error("question_regeneration_no_better", replacement ? hardFault(replacement) : "nothing back");
      }
    } catch (error) {
      console.error("question_regeneration_failed", describeFailure(error, model, 0));
    }
  }

  if (!question && !closes(parsed)) return fail(res, parsed ? "no_question" : "unparseable_reply");
  // Never shown. The closing screens render the reflection and the note.
  if (!question) question = "(not shown)";

  // "Probing", "off-topic" and " reached " are the five statuses written
  // differently, not five different statuses, and the live failure threw away
  // a whole conversation on an all-or-nothing check of this field. Form is
  // normalised; a value that is still not one of the five falls back to
  // probing and is logged.
  //
  // Probing is the only safe default. It keeps asking, where a wrong guess at
  // "verified" would close the conversation telling someone their check
  // covered the case, and a wrong guess at "reached" would close it on a gap
  // they never named. The turn cap ends the conversation either way, so the
  // cost of being wrong here is one more question.
  const recognised = normaliseStatus(parsed.status);
  if (!recognised) console.error("model_call_odd_status", model, statusShape(parsed.status));
  let status = recognised || "probing";

  // Overridden where the measurement and the model disagree. The turn that
  // said "nothing lol" came back "probing", which spends one of four turns
  // and tells the page the answer was usable. It was not.
  const everything = answersOf(body);
  const lastAnswer = everything[everything.length - 1];
  if (isNonAnswer(lastAnswer) && status !== "off_topic") {
    if (status !== "unclear") console.error("status_forced_unclear", statusShape(parsed.status));
    status = "unclear";
  }

  // And a conversation that is mostly non-answers cannot be closed on having
  // found something. "I would look silly" is a consequence, not a gap, and
  // "reached" on it produced a confident closing built on nothing. The turn
  // cap still ends the conversation; the page decides what to show, and the
  // flag below is how it knows.
  // Enforced, because the prompt asking has not been enough for anything else
  // this week. Two answers in means one question asked and answered; closing
  // before that is closing before the tool has done the thing it exists to do.
  const answered = everything.length;
  if ((status === "reached" || status === "verified") && answered < 3) {
    console.error("close_refused_too_early", `${answered} answer(s)`);
    status = "probing";
  }

  const thin = conversationIsThin(everything);
  if (thin && (status === "reached" || status === "verified")) {
    console.error("close_refused_thin_account", `${everything.length} answers`);
    status = "probing";
  }

  const text_or_null = (value, limit) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;

  // Taken on every turn, not only on the two statuses that close. The old
  // rule asked for a reflection on "reached" or "verified" and an empty
  // string otherwise, which made a summary structurally impossible on the
  // most common ending: of seven logged conversations, three ran to the turn
  // cap and two lost the provider, and all five ended with nothing. The owner
  // said he had not seen the summary. He was right - it was never written.
  //
  // So the two lines are a running summary, refreshed each turn, and the
  // client keeps the last non-empty pair. Whatever ending arrives, there is
  // something in hand. It costs a few hundred output tokens a conversation.
  const offered = text_or_null(parsed.reflection, MAX_REFLECTION_CHARS);
  const reflection = offered && drawnFromTheirAccount(offered, answersOf(body)) ? offered : null;
  if (offered && !reflection) console.error("reflection_rejected_not_their_account");

  // The second line says what the check would and would not have caught, so
  // it cannot be held to the first line's test - naming what something would
  // miss needs words the person did not use. It gets the other guard instead:
  // it must stay a description. Advice, a conclusion asserted as fact, a
  // claim about the research, or a sentence aimed at them in the second
  // person are each a different thing from a description of what they
  // described, and each is dropped rather than shown.
  const offeredBoundary = text_or_null(parsed.boundary, MAX_REFLECTION_CHARS);
  const boundary = offeredBoundary && staysDescriptive(offeredBoundary) ? offeredBoundary : null;
  if (offeredBoundary && !boundary) {
    console.error("boundary_rejected", whyNotDescriptive(offeredBoundary));
  }

  return res.status(200).json({
    ok: true,
    build: BUILD,
    question: question.slice(0, MAX_QUESTION_CHARS),
    status,
    // The page shows the neutral closing rather than a conclusion when this
    // is true. A two-line summary of an account with nothing in it is the
    // tool sounding more substantial than its material, which is the one
    // impression it cannot afford.
    thin,
    reflection,
    boundary,
    closing_note: text_or_null(parsed.closing_note, MAX_NOTE_CHARS)
  });
}
