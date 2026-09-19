# Profile extraction prompt

Paste this into each old Perplexity or Claude chat that discussed your career.
One chat at a time. Do not show it your current Profile Bank - if it can see
the existing doc it will pattern-match against it and report "already covered",
which is the recency bias moved rather than removed.

Run it everywhere, collect the outputs, then merge.

---

## THE PROMPT - copy everything below this line

You are extracting facts from this conversation. You are not writing a profile,
a summary, or a CV. Do not improve, polish, or reframe anything.

SCOPE - read this whole conversation from its first message to its last.

Three rules that override everything else:

1. ONLY this conversation. Nothing from web search results, nothing from your
   general knowledge, nothing you infer. If it was not said in this thread, it
   does not exist.

2. TAG EVERY ITEM by who said it. This is the most important instruction here:
     [SAID]      I stated it myself, in my own message.
     [PROPOSED]  You or the assistant suggested it and I never confirmed it.
     [AGREED]    You or the assistant suggested it and I explicitly accepted it.
   If you cannot tell which, tag it [UNCLEAR]. Never guess. An unconfirmed
   suggestion recorded as fact is the single worst outcome of this exercise.

3. NUMBERS VERBATIM. Copy every figure exactly as it appears - the percentage,
   the headcount, the currency, the timeframe, the hedge. "about 30 percent"
   stays "about 30 percent". Never round, merge two figures, or convert units.

EXTRACT, under these headings. Skip any heading with nothing under it - do not
pad. One fact per line.

A. ROLES AND EMPLOYERS
   Employer, job title, dates, location, team size, who I reported to, who
   reported to me, scope of the remit.

B. QUANTIFIED RESULTS
   Every number, with what it measured, over what period, at which employer,
   and what I did that produced it.

C. WHAT I ACTUALLY DID
   Decisions, diagnoses, things I built, problems I reframed, cases I argued,
   negotiations I ran. The action, not the outcome.

D. WORK OUTSIDE THE JOB
   MBA projects and clients, dissertation, independent research and frameworks,
   clubs and societies, things I built myself, sponsorships raised, events run.

E. EDUCATION AND CREDENTIALS
   Degrees, institutions, dates, certifications, programmes.

F. TOOLS AND SYSTEMS I ACTUALLY USED
   Only ones I said I used. Note the level I claimed if I qualified it.

G. NAMED PEOPLE AND CONTACTS
   Name, organisation, how I know them, what the relationship is, whether a
   conversation or referral actually happened or was only planned.

H. APPLICATIONS AND OUTCOMES
   Role, employer, what stage it reached, what the feedback was, and any fit
   percentage or verdict I settled on at the time.

I. STATED PREFERENCES AND CONSTRAINTS
   Locations, sectors, role types, seniority, salary, visa and right to work,
   anything I said I would not do.

J. THINGS I DENIED, CORRECTED OR RULED OUT
   Every time I said a claim was wrong, an inference was off, a tool was not
   mine, or a role was not for me. Quote my correction. These matter as much
   as the positives - they are what stops a future document overreaching.

K. HOW I SAID I WANT TO BE REPRESENTED
   Anything about tone, honesty, hedging, what to never claim.

THEN, at the end, three short lists:

CONTRADICTIONS - anywhere the conversation gives two different versions of the
same fact. Quote both. Do not resolve them.

UNIQUE TO THIS THREAD - the three to five items here most likely to be missing
from a profile written later, because they came up once and were not repeated.

UNVERIFIED - everything tagged [PROPOSED] or [UNCLEAR], gathered in one place,
so it can be checked before it goes anywhere near a document.

FORMAT - plain text, headed sections, one fact per line, the tag at the start
of each line. No prose, no introduction, no closing summary. If this
conversation contains nothing about my career, say exactly that and stop.
