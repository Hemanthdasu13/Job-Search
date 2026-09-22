# Research facts

Every claim the tool may state, with what supports it. **Nothing outside this
file may appear on screen as a finding.** If a claim is not here, it does not
go in.

This file supersedes the earlier working version, which was a whitelist of
eight claims written before the dissertation was available. Everything below
is sourced to a numbered section of the findings chapter of
`dissertation_integrated`, which is the submitted, examined document. The
constraint is unchanged: nothing invented, nothing paraphrased into a finding,
nothing generated. Only the source has caught up.

## The study

Eighteen semi-structured interviews, 22 August to 4 September 2026, across
sixteen sectors: telecoms, energy transmission, sports events, enterprise
technology, investment banking, fintech, enterprise AI software, global
payments, construction, strategy consultancy, food ingredients, retail
banking, public sector consultancy, private equity, manufacturing, public
healthcare.

Fourteen main sample, four supplementary. Themes were developed against twelve
of the main sample, so counts of the form *n of twelve* refer to that subset
and to nothing else. Abductive design, thematic analysis, single coder.

## Claims cleared for use

| Claim | Source | Wording constraint |
|---|---|---|
| Ten of twelve stated the judgement boundary explicitly and unprompted | 4.2 | "the research found". Not "organisations enforce a boundary" |
| Nine of twelve described enforced rules about what data may enter an AI system | 4.4.1 | "described" or "the research found". A claim about accounts, not about policy |
| Not one described a rule about when to believe the output | 4.4.3 | Same constraint. Never "organisations do not govern reliance" |
| Four of twelve had a rule they could state; eight had nothing equivalent | 4.4.3 | Fine as written. Never "asked directly" — nobody was |
| Three of those four had extended a pre-AI decision rule to AI, untold | 4.4.3 | Fine as written |
| No employer was described as supplying a judgement rule | 4.4.3, 4.5 | Fine as written |
| Every verification mechanism described was personal, none designed by an employer | 4.5 | "the research found no employer supplying one" |
| Verification that catches real errors is a constructed check, not a careful read | 4.5 | Fine as written |
| Verification is the first thing to fail under time pressure | 4.8 | Three cases, independently. Fine as written |
| A group finance director found around six errors in a pension model, only after building a reconciliation | 4.5 | The case, de-identified. No quotation — see below |
| AI was described as a junior analyst three times, independently | 4.3 | "three times in the research, independently" |
| The junior analyst rule assumes errors of a recognisable human kind | 4.3 | "the research also holds the objection". Not stated as the study's conclusion |
| Error was detected by knowing roughly what the answer should be, six times | 4.7.3 | "six times in the research" |
| Agreeable rather than accurate output, seven times; five had standing instructions against it | 4.10 | "seven times in the research", "five in the research" |
| Instructing a system to challenge redirects the dynamic rather than escaping it | 4.10.2 | One case only. "the research also holds the argument against that" |
| The same system returns different answers to the same prompt across runs and versions | 4.6 | Fine as written |
| Multi-model comparison is the commonest check in the research | 4.5.3, 4.6 | Fine as written |
| Constraint-based prompting appears twice, in near-identical terms | 4.5.3 | "twice in the research, in almost the same words" |
| Retrospective interaction auditing appears once only | 4.5.3 | Say "one case". Do not generalise it |
| Manual analytical work yields both a deliverable and the capacity to defend it | 4.9.1 | One case only. "one reading in the research, and only one" |
| Domain knowledge, not AI fluency, is what makes output interrogable | 4.9.4, 4.13 | Fine as written |
| Asking what the system had, what it assumes, what might be missing | 4.9.7 | "came out of the research, not from me". Never claimed as study design |
| Only one articulated set of verification trigger conditions appears | 4.5.1 | Say "one case" |

## Participant quotes are not cleared for publication

**No verbatim participant quote appears on this site.** The quotes were given
for a dissertation, reported under participant codes with generalised roles. A
public page linked from a CV is a different purpose from the one consented to,
and the binding documents are the participant information sheet and the
ethics approval, not a judgement call made here.

This costs the tool very little, because the quotes were carrying texture and
not argument. Everything in the table above is a finding of the research,
which is the researcher's to state. A de-identified case description — a group
finance director built a pension model, built a separate reconciliation, found
around six errors — is a finding about a case, not somebody's words. Only the
verbatim quotation is participant data.

### The "condition 19" claim is unverified

A working document in Drive, `ai-verification-tool-spec.md`, states: *"All
quotes cleared under the dissertation's general consent condition (anonymised
quotation, role-level attribution only, per condition 19 of the consent
form)."*

**Do not rely on that sentence.** It is a paraphrase inside a design document,
consolidated from a conversation with a model, and the consent form it cites
has not been located. It may be accurate. It may be a half-remembered
condition hardened into a citation. It may be an inference with a plausible
number attached. Nothing available distinguishes those, and the specificity -
a numbered condition, the word "cleared" - is exactly what makes it read as
settled. It also says nothing about retention, or about whether outputs
beyond the dissertation are covered, which are the parts that decide the
question.

Only the participant information sheet and the signed consent form settle
this. Until one of them is in hand, the position below stands unchanged.

The seventeen quotes are pinned in `evals/quotes.json`, with the findings
section each came from, all marked `cleared: false`. That directory sits
outside `public/`, so nothing there is served. To publish one after its
participant has agreed: set `cleared: true` and put the text back on its card.
`scripts/verify-quotes.mjs` fails if a quote reaches the shipped page without
that flag — anywhere in the file, not just on a card, because hiding one
behind a CSS rule still ships the words and view-source is not a consent
boundary. It also fails if a published quote has drifted from the source, so
nobody's grammar gets tidied on their behalf.

A side effect worth keeping: the only quoted words on screen now belong to the
visitor. The research is asserted as the researcher's finding, and the one
person being quoted is the one reading it.

## How the research is referred to on screen

One noun: **the research**. Never "participants", "one participant", "the
study", "the interviews", "someone said", "one described". Counts stay,
because the counts are the evidence: "four of twelve in the research", "seven
times in the research", "twice, in almost the same words".

A finding that rests on a single case is still marked as a single case, but
without narrating a person: "one case in the research", "one reading in the
research, and only one", "the research also holds the objection". That keeps
the accuracy the old wording was there for - one person's view must not read
as a general finding - without the register that made the page sound like a
write-up of a focus group.

The exception is the methodological caveat below, which is a citation rather
than prose, appears once per closing screen under a rule, and stays verbatim.

Plain sentences. The prose should sound like someone telling you something
they found out, not like a journal abstract.

## Never say

- **"Organisations do not govern reliance."** The interview guide did not ask
  this systematically. The claim is about what practitioners volunteered.
- **Any category assigned to the user.** The verification approaches and the
  literacy bands are exploratory constructs coded post hoc by a single coder.
  They may not be used to classify anyone. The closing screen names what did
  not come up in one account; it never names what kind of person typed it.
- **Any score, level or maturity rating.**
- **Any participant's words at all**, unless that quote is marked
  `cleared: true` in `evals/quotes.json`. Today none of them is.
- **Any statistic not in the table above.** In particular: no deal values, no
  prices, no named employers, no net promoter scores, no percentage gains.
  Several appear in the dissertation and none of them are needed here.
- **Anything from section 4.14.** The ceiling proposition was
  researcher-introduced and rests on self-assessment. The dissertation itself
  advances it as warranting testing rather than as a finding.

## The caveat that must appear on every closing screen

> Eighteen interviews, sixteen sectors. Exploratory qualitative research,
> single coder, not a validated instrument.

Verbatim, on 5A, 5B and 5C. This is not defensive. It is the difference
between a research artifact and a personality quiz, and anyone senior enough
to matter will check.
