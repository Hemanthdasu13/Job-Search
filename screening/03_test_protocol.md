# Screening test protocol

DO NOT upload this file into the Project. It is your script, not the model's.
If the model reads the test design it will read the answers too.

Upload only these two into Project knowledge:
  - 01_candidate_profile.md
  - 02_screening_rubric.md

---

## What is being tested

Not "is Claude any good". Claude is fine. The question is narrower:

    Does screening quality survive being done in batches?

The API version makes one call per role with nothing shared between roles.
The chat version puts many roles in one conversation. That is the only
difference worth measuring, so hold everything else identical: same profile,
same rubric, same output format, same roles, same model.

---

## Arm A - ten roles, ten separate chats

In the Project, open a new chat per role. Paste the ROLE PROMPT with one
advert. Save the output. Ten chats, ten verdicts, no shared context.

This is the control. It reproduces the API's statelessness on your
subscription, at no cost, so you can run it before buying any credit.

## Arm B - ten roles, one chat

One chat in the same Project. Paste the BATCH PROMPT with all ten adverts.
Save the output.

## Arm C - one hundred roles, one chat

Same as B, one hundred adverts. This arm has no right answers and does not
need any. It exists to measure whether verdict 95 is as thorough as verdict 5.

---

## Choosing the roles

Do not use ten roles you feel the same way about. The test needs spread.

  3 you are confident are a good fit
  3 you are confident are wrong for you
  4 you genuinely cannot call

The confident six catch false negatives and false positives. The uncertain
four are where the tool either earns its place or does not.

Use the roles from Profile Bank section 8 where you still have the advert
text, since you know how those ended. Where you do not have the advert, take
a row from the current workbook instead - outcomes are noisy anyway, because
a rejection at 400 applicants says little about fit.

---

## Write your own verdict first

Before you read any model output, write down for each of the ten:

  your verdict, your ceiling percent, and the one thing that worries you

Seal it. If you read the model's reasoning first you will find it persuasive,
because it is written to be, and you will lose the ability to tell a good
verdict from a plausible one.

---

## Scoring

Accuracy, Arm A against Arm B:

  1. How many of the ten verdicts differ between the two arms
  2. On the six you were confident about, how many did each arm get right
  3. On the four you were unsure about, did the reasoning tell you something
     you had not already thought of - this is the only question that matters
     for whether the tool is worth running at all

Degradation, Arm C - count these, do not eyeball them:

  4. Number of advert quotes in verdicts 1-10 vs verdicts 91-100
  5. Word count of verdicts 1-10 vs verdicts 91-100
  6. Number of late verdicts that name no ESSENTIAL gap at all
  7. Whether any late verdict quotes an advert belonging to a different role

Prediction on the record, so this test can prove it wrong: verdicts 1-10 will
carry two or more quotes each and read specifically; by verdict 90 the quotes
thin out and the language turns generic. If quotes and word counts hold flat
across all one hundred, batching is fine and the cheap route wins.

---

## ROLE PROMPT - Arm A, one role per chat

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

---

## BATCH PROMPT - Arms B and C, all roles in one chat

Screen each role below against the profile and rubric in this Project.

Rules for this batch:
- Treat every role as if it were the only one you had been given.
- Use the rubric's output format exactly, once per role, numbered by row.
- Every MATCHING EVIDENCE and GENUINE GAPS line carries a verbatim quote from
  that role's own advert. Never carry a quote across roles.
- Do not summarise, rank or compare the roles against each other.
- Do not get shorter as you go. The last role gets the same treatment as the
  first. If you are running out of room, stop at a role boundary and say which
  row you stopped at, rather than compressing the ones that remain.

ROLES

ROW 1
Title:
Company:
Location:
Link:
Advert:
<paste>

ROW 2
...

---

## Deciding

Arm B matches Arm A on the ten, and Arm C holds quality to role 100:
  batching works. Build the splitter, skip the API, done.

Arm B matches on the ten but Arm C degrades:
  batching works only in small batches. Find the size where it breaks -
  try 25 - and split to that instead of 100.

Arm B differs from Arm A on roles you were confident about:
  batching is costing accuracy, not just polish. Use per-role calls.

Any arm contradicts your sealed verdicts on the confident six:
  the rubric is wrong, not the plumbing. Fix that before scaling anything.
