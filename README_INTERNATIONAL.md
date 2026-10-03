# International Role Discovery

Same engine as the UK notebook, pointed at nine non-UK markets. Built from
`HEMANTH_ROLE_DISCOVERY_WORKFLOW.ipynb` by a patch script, so every shared fix
has one home and does not have to be applied twice.

Markets: UAE, Ireland, Netherlands, Poland, Portugal, Spain, Germany, France,
Belgium. India is deliberately out - see the end.

---

## The honest case for and against this notebook

**The hypothesis being tested:** a niche financial services firm interviews
him, decides he is the right person, and sponsors.

**It is not a fantasy.** Employers sponsor when the cost of not hiring exceeds
the cost of the paperwork, and that happens. Smaller specialist firms sponsor
*more* readily than large ones at this level, because a large firm has a
pipeline of local candidates and a process that screens out non-sponsorable
applicants long before a human reads the CV, whereas a forty-person firm
filling a role it cannot fill locally will do the forms for the right person.
The EU routes are also less painful than the UK's: the Dutch Highly Skilled
Migrant process is fast and thousands of employers are already recognised
sponsors.

**Three things about the hypothesis are wrong, though.**

*The MBA is not what unlocks the permit.* Blue Card and equivalent routes
require a recognised degree - the B.Tech already satisfies that. The MBA helps
win the interview. Presenting it as the answer to the visa question will not
land, and the screening rubric is explicitly told not to.

*"They find me" is the weak link.* Sponsorship-willing firms do not advertise
that they sponsor. They advertise normally and decide at offer stage. **No
tool can read willingness to sponsor out of a job advert, because it is not in
the advert.** This notebook cannot tell you who will sponsor. What it can do
is narrow the field to roles where the question is worth asking, and - for the
Netherlands - check the employer against a register of firms that demonstrably
already do it.

*Salary thresholds, not willingness, are usually the binding gate.* The Dutch
Highly Skilled Migrant threshold **steps up sharply at age 30**. Which side of
that line you are on when you apply changes which roles qualify. Find out
before planning around that market.

**So the reframe that matters:** you are not looking for employers who sponsor.
You are looking for roles where you are *plainly the best available candidate*,
because that is the only thing that makes anyone do paperwork. A competent
generic fit in Amsterdam loses to an EU national who needs none. A rare
specific fit does not.

That reframe is built into the tool as the **Worth Sponsoring?** column and the
**Rare Fit - Best Odds** sheet, which look for what an employer cannot get
locally: emerging-market operating experience, bancassurance, retail banking
operations at scale, shared-service operating models, regulated-industry and
price-control work, the published infrastructure research, the AI-adoption
dissertation, the Moasure GTM project.

---

## Why the markets are in this order

Ranked by reachability for an Indian national with a UK MBA, no EU status and
no local language - not by market size. Thin competition is worth nothing where
the gate is authorisation rather than candidate quality.

1. **UAE** - English-working, employer-sponsored permits are routine and fast,
   no points test, no language gate. The strongest non-UK market, because
   Indian retail banking, bancassurance and HNW portfolio experience is
   discounted in the UK and priced correctly in the Gulf.
2. **Ireland** - English, EU, Dublin financial services, Critical Skills
   Employment Permit. **The UK notebook actively excludes Dublin and Ireland,
   so no Irish role has ever appeared in that output.**
3. **Netherlands** - Highly Skilled Migrant, or the Orientation Year, which is
   open to graduates of highly-ranked non-Dutch universities and carries a year
   of unrestricted work rights with **no employer sponsorship at all**. Verify
   eligibility and the deadline first; if it applies, the Netherlands becomes
   as open as the UK and this ranking is wrong.
4. **Poland** - the arbitrage argument is strongest here and it is correct.
   Kraków, Warsaw and Wrocław are full of service centres running commercial
   operations, process redesign and transformation for Western European banks,
   in English, with permit thresholds well below Western Europe. Pay is good
   locally and well below UK.
5-9. **Portugal, Spain, Germany, France, Belgium** - progressively more likely
   to need the local language for commercial roles. Expect the language filter
   to remove most of what the search returns in 7-9.

Nothing in the config is immigration advice. Each market records the permit
route and what it turns on so you know what to verify.

---

## What the workbook gives you

| Sheet | Use |
|---|---|
| **Rare Fit - Best Odds** | start here - no language gate AND something an employer cannot hire locally |
| **No Language Gate** | everything the advert does not gate on a language you lack |
| **Language Gated** | a required language you do not have. Not near misses - kept off the working list |
| **Contract Roles** / **New Contract Roles** | fixed-term and interim, startable sooner |
| **Jobs**, **New Since Last Run**, **Rolling Top 20**, **Networking Tracker**, **Run Log**, **Manual Checks** | as the UK build |

Per-row columns: `Market`, `Language Gate`, `Worth Sponsoring?`,
`Service Hub`, `Recognised Sponsor`, `Permit Route`, `Permit Gate`.

---

## Language logic

The question is never "does the advert mention Dutch". It is whether Dutch is
**essential or desirable** - the same split the screening rubric already runs.
`REQUIRED` is a gate; `DESIRABLE` is not and must not be inflated into one.

An advert written in English is **not** treated as evidence the job is done in
English; plenty of Dutch and Polish employers advertise in English for roles
whose daily language is local. Only explicit statements count. A role saying
*"our working language is English, fluent German required"* resolves to German
required, because reassurance does not cancel a gate.

The trap was "Polish". *"Polished communication skills"* and *"polish your
craft"* appear in a large share of commercial adverts, and a naive match would
mark half of Europe as requiring Polish. Thirty false-friend phrases are masked
first, `dutch auction` and `german market` among them. 23 of 23 cases pass,
including all seven false friends.

---

## The bug this build found

Two inherited filters would have silently emptied most of the target markets.

`get_country_continent()` **defaults any city it does not recognise to "UK"**,
and the export drops every row whose country is on the excluded list - which
here includes the UK. Utrecht, Rotterdam, Kraków and Gdańsk were all resolving
to "UK" and being binned without a word. Kraków is the single most important
city in the Poland case.

`STRICT_NON_UK_TERMS` is the UK build's foreign-city blocklist, and it lists
Dubai, Dublin, Amsterdam, Warsaw, Lisbon, Madrid, Berlin, Paris - precisely the
cities this notebook is for. The ATS and LinkedIn paths use it, and UAE,
Ireland and Portugal have **no Adzuna endpoint**, so they are served by those
paths alone: leaving it would have made three markets return nothing while
looking like they had simply found no jobs.

Both now derive from the one market config. `test_intl_cities.py` asserts all
78 configured cities pass every gate and resolve to their own country, and that
London, Edinburgh, Cardiff, Bangalore and New York are still rejected. That
test exists so this cannot regress quietly.

---

## Setup

1. Colab, File > Save a copy in Drive. Add `ADZUNA_APP_ID` and
   `ADZUNA_APP_KEY` to Secrets - **one key covers all six Adzuna markets.**
   Reed is UK-only and is a no-op here.
2. Runtime > Run all. Output: `hemanth_international_roles.xlsx`.
3. It keeps its own state store (`./international_state`), so the UK run's
   "what is new" is untouched and nothing is screened or paid for twice.

**Optional, and the most valuable thing in this build:** the IND publishes a
free public register of recognised sponsors - employers that have already
sponsored non-EU staff. Download it, put it in Drive, and set
`SPONSOR_REGISTER_CSV` in cell 1. The `Recognised Sponsor` column then turns
"who might sponsor" from unknowable into a lookup. Left blank it reads
"register not loaded" rather than guessing.

AI screening works as in the UK build and is off by default. The rubric is told
that the Graduate visa does not apply here, that the real question is whether
he is clearly the best available candidate, and to name what the employer
cannot get locally or score the role down and say why.

---

## Limits worth stating

- **Coverage is uneven.** Six markets have Adzuna; UAE, Ireland and Portugal
  run on employer ATS sites and LinkedIn only and will return far fewer rows.
  That is a coverage limit, not a thin market - do not read it as "no jobs".
- **Willingness to sponsor is unknowable from an advert.** The register helps
  for the Netherlands only.
- **No salary-threshold check.** Adverts often omit salary, and thresholds move
  annually and by age. The permit gate is described, not computed.
- **Unverified immigration detail.** Every route and gate in the config needs
  checking against the current official source before you rely on it.

## India

Left out on instruction, and cheap to add later: Adzuna has an `in` endpoint,
so it is one more entry in `MARKETS` with `adzuna="in"` and no new integration
at all. Naukri dominates the market and has no public API, so better coverage
would be a scraping project - worth doing only if a first cut shows the roles
are there.
