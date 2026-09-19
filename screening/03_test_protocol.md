# Screening test protocol

DO NOT upload this file into the Project. It is your script, not the model's.
If the model reads how it is being graded, the test is worthless.

Into Project knowledge, these two only:
  01_candidate_profile.md
  02_screening_rubric.md

---

## The one question being tested

Does screening quality survive being done in bulk?

Nothing else. Claude can screen a job advert well - that is not in doubt.
What is in doubt is whether the 90th advert in a single conversation gets
read as carefully as the 1st, or whether the model slips into list mode and
starts producing verdicts that match the rhythm of its own earlier answers
instead of reading the advert in front of it.

If quality holds, split the workbook into sheets, screen them in chat, and
never pay for API credit. If it does not, the money buys back the quality.

---

# TEST 1 - THE HUNDRED

Do this one first. It is the cheapest way to get a decisive answer, it needs
no known outcomes, and it can settle the whole question on its own.

## Setup

1. claude.ai, Projects, Create project. Call it "Job screening".
2. Project knowledge: upload 01_candidate_profile.md and 02_screening_rubric.md.
3. In Excel, open your roles workbook. Copy the first 100 rows into a new
   file, keeping the header row and the full Job Description column.
   Save it as test_100.xlsx.

   Watch for this: very long adverts spill into continuation columns, because
   a single Excel cell caps at 32,767 characters. If your sheet has columns
   like "Job Description 2", bring them too, or you are testing the model on
   truncated adverts and proving nothing.

## Run

4. New chat inside the Project.
5. Attach test_100.xlsx.
6. Paste the BATCH PROMPT (bottom of this file).
7. When it stops, type "continue" until all 100 are done. Count the turns
   this took - that number is itself a finding.
8. Copy every verdict into one document.

## Score it - count, do not eyeball

Compare the first ten verdicts against the last ten:

  a. Advert quotes per verdict. The rubric requires a quote behind every
     claim. Falling quote counts are the model failing to follow instructions,
     which is measurable, not a matter of taste.
  b. Word count per verdict.
  c. How many late verdicts name no ESSENTIAL gap at all.
  d. Any verdict quoting an advert that belongs to a different role. Even one
     is disqualifying - it means the roles have started bleeding together.
  e. How many "continue" turns it needed, and whether quality dropped after
     each one.

## Read the result

Quotes and word counts flat across all 100, no cross-contamination:
  Bulk screening works. Build the splitter, skip the API. I was wrong.

Quality holds early and fades late:
  Bulk works, but not at 100. Re-run at 25 and find where it breaks.
  Split the workbook to that size instead.

Quotes disappear, verdicts turn generic, or roles bleed into each other:
  Bulk screening is the thing that was making your results sloppy.
  Per-role calls are worth paying for.

---

# TEST 2 - THE TEN

Only worth running if Test 1 passed. Test 1 asks whether the method survives
volume; this asks whether the method is right at all.

## Pick the roles

Ten roles, deliberately spread:
  3 you are confident are a good fit
  3 you are confident are wrong for you
  4 you genuinely cannot call

The confident six catch false positives and false negatives. The uncertain
four are the only ones where the tool can tell you something you did not
already know - which is the real test of whether it is worth running.

Prefer roles from Profile Bank section 8 where you still have the advert
text, since you know how those ended. Where you do not have the advert, take
rows from the workbook. Outcomes are noisy anyway: a rejection against 400
applicants says very little about fit.

## Seal your own verdicts first

Before any model output, write for each of the ten:
  your verdict, your ceiling percent, the one thing that worries you

Put it away. If you read the model's reasoning first you will find it
convincing, because it is written to be, and you will lose the ability to
tell a correct verdict from a well-argued one.

## Run it twice, the same ten roles both times

Round 1 - one at a time.
  Ten separate new chats in the Project. Each chat gets the ROLE PROMPT and
  one advert. Nothing is shared between them.
  This is the control. It reproduces on your subscription exactly what the
  API version does - a fresh, uncontaminated read per role - so you can
  compare against it without buying credit.

Round 2 - all together.
  One new chat. The BATCH PROMPT with all ten adverts in it.
  Same ten roles. Same Project. Same rubric. The only thing that changed is
  that they now share a conversation.

That is the whole design: identical work, done two ways, so any difference
in the output is caused by the batching and nothing else.

## Score it

  1. On how many of the ten do Round 1 and Round 2 give a different verdict?
     A different ceiling percent?
  2. On your six confident roles, how many did each round get right?
  3. On your four uncertain roles, did either round tell you something you
     had not already thought of? If neither did, the tool is not earning its
     place regardless of which plumbing you choose.

## Read the result

Rounds agree, and both match your sealed verdicts:
  The rubric is sound and batching is not hurting it at this size.

Rounds agree with each other but contradict you on the confident six:
  The rubric is wrong, not the plumbing. Fix that before scaling anything.

Rounds disagree with each other:
  Batching is costing accuracy, not just polish. Per-role calls.

---

# PROMPTS

## ROLE PROMPT - Test 2, Round 1, one role per chat

Screen this role against the profile and rubric in this Project.
Follow the rubric's method in order and use its output format exactly.
Quote the advert for every claim. Do not soften the gaps.

ROLE
Title:
Company:
Location:
Link:
Advert:
<paste the full advert text>

## BATCH PROMPT - Test 1, and Test 2 Round 2

Screen every role in the attached file against the profile and rubric in
this Project.

Rules for this batch:
- Treat each role as if it were the only one you had been given.
- Use the rubric's output format exactly, once per role, numbered by row.
- Every MATCHING EVIDENCE and GENUINE GAPS line carries a verbatim quote from
  that role's own advert. Never carry a quote from one role to another.
- Do not summarise, rank or compare the roles against each other.
- Do not get shorter as you go. The last role gets the same treatment as the
  first. If you are running out of room, stop at a role boundary and tell me
  which row you stopped at, rather than compressing what remains.
- Read the Job Description column in full, including any continuation
  columns. Tell me if any advert reaches you truncated.

(If you are pasting adverts rather than attaching a file, replace the first
line with "Screen each role below" and list them as ROW 1, ROW 2 and so on,
each with Title, Company, Location, Link and Advert.)
