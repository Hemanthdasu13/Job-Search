# Full history extraction - verbatim dump protocol

Replaces the earlier version of this file.

Purpose: pull the complete raw career material out of an old chat - every CV
version, every bullet, every cover letter, every interview story, in the exact
words they were written in. Not a summary. The tailoring tool needs real
approved bullets to select and adapt from, and a summary destroys exactly the
thing it needs.

Why it runs in passes: a long conversation asked to "reproduce everything" will
compress. Asked for one category at a time it will not. Run the passes in
order, in the same chat, one message each.

---

## STANDING RULES - the model must be given these in every pass

Paste this block at the top of every pass below.

    STANDING RULES for this and every following request:
    - VERBATIM. Reproduce text exactly as written in this conversation,
      character for character. Do not rewrite, tighten, correct grammar,
      fix typos, modernise phrasing, or "improve" anything.
    - NO SUMMARISING. Never write "and so on", "similar bullets follow",
      "(3 more)", or any placeholder. Every item in full.
    - NO DEDUPLICATION. If a bullet appears four times with small edits,
      reproduce all four as separate items. The differences are the point.
    - ONLY THIS CONVERSATION. Nothing from web results, nothing from your
      general knowledge, nothing inferred.
    - IF YOU RUN OUT OF ROOM: stop at a clean boundary, then write
      "STOPPED AT: <document name> / <item number>" as the last line and
      nothing else. I will reply "continue". Never compress to fit.
    - ORDER: earliest in the conversation first, latest last.

---

## PASS 0 - inventory first

    [STANDING RULES]

    Do not reproduce any content yet. Read this entire conversation and give
    me an inventory of the career material in it.

    List, in the order they appear:
    1. Every complete or partial CV / resume version. For each: a label, where
       in the conversation it sits, roughly how long it is, and what made it
       different from the version before it.
    2. Every cover letter or application email.
    3. Every LinkedIn headline, About section, or profile text.
    4. Every interview answer or STAR story written out in narrative form.
    5. Every standalone set of bullets that was not part of a full CV.
    6. Every table, matrix or framework (skills mappings, competency grids,
       role comparisons).
    7. Anything else substantial I would want preserved.

    For each entry give me a one-line description only. Then tell me the total
    count per category. This is a checklist, not the content.

Keep this inventory. It is how you verify nothing was silently dropped later.

---

## PASS 1 - full CV versions

    [STANDING RULES]

    Reproduce every complete or partial CV / resume version from this
    conversation, in full, verbatim, oldest first.

    Before each one write:
    === CV VERSION <n> ===
    CONTEXT: <what it was written for, if the conversation says>
    WHO WROTE IT: mine / drafted by the assistant / assistant draft I edited
    STATUS: <did I say I used it, rejected it, or never say>

    Then the document itself, exactly as written, including section headings,
    dates, formatting and any bracketed notes.

    Do not merge versions. Do not skip one because it looks like a small edit
    of another.

---

## PASS 2 - the bullet inventory

This is the pass that matters most for tailoring.

    [STANDING RULES]

    Extract every achievement bullet that appears anywhere in this
    conversation - inside CVs, in standalone lists, in drafts, in rewrites,
    in options you offered me, in versions I rejected.

    One per line, in this shape:

    [n] "<the bullet, verbatim, complete>"
        EMPLOYER: <which role it belongs to>
        SOURCE: my own wording / assistant draft / assistant draft I edited
        STATUS: I used it / I rejected it / I edited it into something else /
                never said
        MY COMMENT: <anything I said about this specific bullet, quoted>
        VARIANT OF: <bullet number, if it is a rewrite of another one here>

    Include weak ones, early ones and rejected ones. A rejected bullet plus
    the reason I rejected it is more useful than a polished one on its own,
    because it tells a future draft what not to do.

    Number them continuously. Do not group, rank or tidy.

---

## PASS 3 - positioning text

    [STANDING RULES]

    Reproduce verbatim, oldest first:
    - Every CV summary or personal-statement paragraph, every version.
    - Every LinkedIn headline and About section, every version.
    - Every short self-description I wrote or approved - "I am a ...",
      elevator pitches, opening lines for outreach.

    Label each with where it was used and whether I said I used, edited or
    rejected it.

---

## PASS 4 - cover letters and outreach

    [STANDING RULES]

    Reproduce in full, verbatim, every cover letter, application email,
    LinkedIn message, referral request and networking message in this
    conversation.

    For each: the role and company it was for, whether it was sent, and any
    reply or outcome mentioned.

---

## PASS 5 - interview answers and stories

    [STANDING RULES]

    Reproduce in full, verbatim, every interview answer, STAR story, "tell me
    about a time" narrative, competency example and question-preparation note.

    For each: the competency or question it answers, and whether I said it was
    actually used in a real interview and how that went.

---

## PASS 6 - my corrections and constraints

    [STANDING RULES]

    Two lists.

    FIRST - every time in this conversation I corrected, rejected or pushed
    back on something: a wrong fact, an inflated number, a tool I do not have,
    a phrasing I disliked, a framing I refused, a role type I ruled out.
    Quote my exact words, and quote what I was responding to.

    SECOND - every instruction I gave about how I want to be written about:
    tone, honesty, hedging, formatting, length, what must never be claimed,
    words to avoid.

    These are rules, not facts. Reproduce them exactly.

---

## PASS 7 - applications and outcomes

    [STANDING RULES]

    Every role I applied to or considered in this conversation:
    role title, employer, which CV version I used, what I said about fit, the
    stage it reached, and any feedback quoted. Verbatim where I quoted it.

---

## Checking the dump

Against the PASS 0 inventory:
  - Does the CV version count match what came out of PASS 1?
  - Does anything in the inventory have no content anywhere in passes 1 to 7?
  - Did any pass end without a "STOPPED AT" line and also look short? That is
    silent truncation - ask it to redo that pass.

Then move to the next chat and start again at PASS 0.
