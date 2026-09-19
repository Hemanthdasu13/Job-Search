# Role Discovery Workflow

A single Colab notebook that collects UK job adverts from public sources,
scores them against one candidate's evidenced profile, tracks what is new
between runs, and optionally asks Claude for a reasoned apply / do-not-apply
verdict on each one.

Built by Hemanth Dasu. The candidate layer is built from a documented Profile
Bank rather than a CV, so every rule the scorer applies traces back to
something on the record.

---

## The problem it addresses

Job boards optimise for volume of matches. A keyword search for "strategy
manager" over UK boards returns thousands of adverts, most of which fail on
something the search cannot see: the role is really a sales quota, the
essential criteria include a tool the candidate has never used, or the
employer wants sector experience the candidate does not have.

The cost of that is not the reading time. It is that a tailored application
takes two to three hours, so the binding constraint is how many applications
a person can write, and every hour spent on an unwinnable one is an hour not
spent on a winnable one.

This tool moves the filter earlier. It is explicitly built to produce a
smaller list, and to argue against applying where the case is weak.

---

## Pipeline

    1  Configuration      profile, role taxonomy, scoring weights, exclusions
    2  Scoring engine     10 dimensions, do-not-apply gating, honest gaps
    3-13  Collection      job-board APIs and employer career sites
    14 State store        what is new, returning, reposted or expired
    15 Export             Excel, four sheets, clickable links, full adverts
    16 AI screening       per-role reasoned verdict (off by default)

Collection covers two job-board APIs (Adzuna, Reed), LinkedIn public search
pages, and employer career sites served by Greenhouse, Lever, Workable,
Ashby, SmartRecruiters, Recruitee and Workday. Adzuna and Reed need free API
keys; everything else works without one.

Output is a single workbook: **Jobs**, **Rolling Top 20**, **Networking
Tracker**, **New Since Last Run**, **Run Log**, **Manual Checks**. Job
descriptions are stored in full and untrimmed, spilling into continuation
columns past Excel's 32,767-character cell limit, so the workbook is a
complete archive rather than a list of links.

---

## Three design decisions worth explaining

### 1. Position-weighted keyword scoring

A naive relevance score counts keyword hits. That rewards length: a 6,000-word
advert full of boilerplate outscores a tight 400-word one for the same job,
because it mentions more things.

Terms are therefore weighted by where they appear - title at 1.0, opening
section at 0.6, body at 0.2 - and the score is normalised against the section
length rather than the document. A term in the job title is evidence about
the role. The same term in paragraph 40 of the diversity statement is not.

### 2. Three-key deduplication and a persistent state store

The same job appears under several URLs, on several boards, sometimes with a
slightly different title. Across runs it also needs to be recognised as the
same job it was yesterday, or "what is new" is meaningless.

Each advert gets three fingerprints:

  - **canonical URL** - the real job id with tracking parameters stripped
  - **content key** - normalised title, company and location
  - **JD hash** - a hash of the advert body, scoped to the employer

A match on any one is the same job. Where two records describe one job, the
more complete one wins rather than the first one seen. A job absent from a
source for three consecutive runs is marked expired, not deleted - and a
source that returns nothing at all has its jobs *held*, not expired, so a
temporary outage does not wipe the record.

Measured on a real re-run: **13 new, 2,593 returning.** That ratio is the
whole point. The daily task is thirteen adverts, not two and a half thousand.

### 3. The honesty constraint

Every commercial matching product is incentivised to show more matches. This
one is built to do the opposite, and the rule is explicit: where two or more
*essential* criteria are genuine unbridgeable gaps, the verdict is
DO_NOT_APPLY, regardless of how well everything else fits.

The AI screening layer cannot make a claim it cannot support with a quote
from the advert, must label each gap as essential or desirable and quote the
wording that makes it so, and is calibrated against verdicts the candidate
reached himself on real applications with known outcomes.

This is the same question as the author's MBA dissertation - how to design
the integration of AI-generated insight with human judgement for commercial
decisions - with the tool as one working instance of it. The system produces
a reasoned recommendation and a named limitation; the human decides and
writes. Nothing is auto-applied, by deliberate design.

---

## Engineering log

The fixes below were all found by running the tool on real data and examining
output that looked plausible. Each one is a commit in this repository.

**Location filter matched almost nothing.** The exclusion list held
`"united states"` and `" us,"`, neither of which matches a bare `US`. Of
4,374 collected rows it removed 54. Fixed by inverting the logic to require
positive UK evidence, with word-boundary matching for short tokens.

**Score saturation, twice.** Any advert over ~5,000 words scored 10/10 on
capability and alignment, because enough keywords appear by chance in a long
document. Fixed in `score_job`, and then found again in
`score_capability_dimensions`, which had the same bug and had been missed on
the first pass. Both now position-weighted.

**The AI layer was reading 16% of the advert.** The trimmer cut at the first
"about us" heading. On a 3,739-character advert it passed 617 characters to
the model - company boilerplate, with the responsibilities and the essential
criteria removed. Every verdict was formed without the section that decides
fit. The trimmer now keeps the head *and* the requirements section, and where
an advert exceeds the cap it begins the tail slightly before the section
heading so the heading survives with its content.

**Career-page category links with no advert behind them.** Collection was
returning navigation URLs as jobs. Now filtered.

**Dead diagnostic cells.** Five cells left from an earlier build were making
around twenty HTTP calls per run, one of them downloading a 1.8 MB page that
was never read. Removed.

**A regression caught in review, not by tests.** A rebuild of the taxonomy
dropped eleven terms - banking transformation, fintech strategy, sales
operations, commercial partnerships and others - because the list was rewritten
rather than diffed. Caught by the author reading the diff. The lesson was
process, not code: a vocabulary is data and must be edited as data.

---

## How it was tested

`smoke_hem.py` executes all 17 cells with the network, Colab and Anthropic
client stubbed, so a structural break is caught without making a request or
spending anything. `test_state.py` and `test_expiry.py` drive the state store
through multi-day scenarios including a source outage. `test_ai.py` runs the
screening cell against a stubbed client and asserts on what would have been
sent - model, effort, cached prefix, and whether the advert reaching the model
still contains its requirements section.

What has **not** been done, and should be said plainly: the screening verdicts
have not yet been validated against known outcomes. A calibration protocol
against ten documented applications is written and not yet run. Until it is,
the tool's recall and precision are unmeasured.

---

## Known limitations

**A rule-based score gates what the reasoning layer ever sees.** Only roles
above a keyword-derived threshold are sent for AI screening. If the keyword
score is wrong about a role, the reasoning layer never gets the chance to
correct it. This is the weakest joint in the design.

**Source coverage is biased towards employers who use modern ATS platforms.**
Greenhouse, Lever and Ashby skew heavily technology-sector. Several of this
candidate's best-fit sectors - utilities, regulated infrastructure, retail
banking - largely do not use them, so those employers are systematically
under-sampled relative to how well they fit.

**No feedback loop.** Applications and their outcomes are not fed back into
the score. The tool cannot currently learn that its confident recommendations
are being rejected.

**Single candidate.** The configuration is separated into one cell, but the
tool has only ever been run against one profile, so the boundary between
engine and configuration is asserted rather than demonstrated.

---

## Privacy

`SHARE_MODE` in the configuration cell controls whether warm introductions are
described by category or by name. It ships **on**.

The Evidence Angle column is written to three sheets, and with the flag off it
names individuals and characterises the author's relationship with each. Those
people did not agree to appear in a spreadsheet. Any copy of this notebook or
its output that leaves the author's own machine runs with `SHARE_MODE = True`;
scoring is byte-for-byte identical either way, and an assertion fails the run
if the two angle maps ever cover different employers.

No credentials are stored in the notebook. Keys are read from Colab Secrets,
with paste-in-place slots as a fallback, and are never written to output.

---

## Running it

1. Open in Google Colab, File > Save a copy in Drive.
2. Add `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY` to Colab Secrets.
   Optional - every other source works without them.
3. Runtime > Run all. Roughly 10-20 minutes depending on source response times.
4. The workbook downloads automatically, and a dated copy is kept beside the
   state file so run-to-run comparison survives.

For AI screening: add `ANTHROPIC_API_KEY` to Secrets and set
`RUN_AI_REVIEW = True` in cell 16. It is off by default so that nothing is
ever spent by accident. `AI_REVIEW_LIMIT` caps the number of roles per run;
with the flag off the cell prints how many roles *would* be screened, which
is the cost estimate before any commitment.
