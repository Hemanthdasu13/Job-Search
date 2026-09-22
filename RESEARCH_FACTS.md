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
| Ten of twelve stated the judgement boundary explicitly and unprompted | 4.2 | "stated" or "drew". Not "organisations enforce a boundary" |
| Nine of twelve described enforced rules about what data may enter an AI system | 4.4.1 | Say "described". It is a claim about accounts, not about policy |
| Not one described a rule about when to believe the output | 4.4.3 | Same constraint. Never "organisations do not govern reliance" |
| Four of twelve had a rule they could state; eight had nothing equivalent | 4.4.3 | Fine as written. Never "asked directly" — nobody was |
| Three of those four had extended a pre-AI decision rule to AI, untold | 4.4.3 | Fine as written |
| No participant described an employer supplying a judgement rule | 4.4.3, 4.5 | Fine as written |
| Every verification mechanism described was personal, none designed by an employer | 4.5 | Fine as written |
| Verification that catches real errors is a constructed check, not a careful read | 4.5 | Fine as written |
| Verification is the first thing to fail under time pressure | 4.8 | Three participants, independently. Fine as written |
| A group finance director found around six errors in a pension model, only after building a reconciliation | 4.5 | Quote is exact. Do not trim, paraphrase or add an ellipsis |
| Three participants independently described AI as a junior analyst | 4.3 | Fine as written |
| The junior analyst rule assumes errors of a recognisable human kind | 4.3 | Attribute the objection to a participant, not to the study |
| Six participants detected error by knowing roughly what the answer should be | 4.7.3 | Fine as written |
| Seven described systems producing agreeable rather than accurate output; five adopted standing instructions against it | 4.10 | Fine as written |
| Instructing a system to challenge redirects the dynamic rather than escaping it | 4.10.2 | One participant's argument. Attribute it as such |
| The same system returns different answers to the same prompt across runs and versions | 4.6 | Fine as written |
| Multi-model comparison is the most common verification practice in the sample | 4.5.3, 4.6 | Fine as written |
| Constraint-based prompting was described by two participants in near-identical terms | 4.5.3 | Fine as written |
| Retrospective interaction auditing was described by one participant only | 4.5.3 | Say "only one". Do not generalise it |
| Manual analytical work yields both a deliverable and the capacity to defend it | 4.9.1 | One participant's framing. Attribute it |
| Domain knowledge, not AI fluency, is what makes output interrogable | 4.9.4, 4.13 | Fine as written |
| Asking what the system had, what it assumes, what might be missing | 4.9.7 | Must be attributed to a participant, not to the study's design |
| The only articulated set of verification trigger conditions came from one participant | 4.5.1 | Say "only one" |

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

## Never say

- **"Organisations do not govern reliance."** The interview guide did not ask
  this systematically. The claim is about what practitioners volunteered.
- **Any category assigned to the user.** The verification approaches and the
  literacy bands are exploratory constructs coded post hoc by a single coder.
  They may not be used to classify anyone. The closing screen names what did
  not come up in one account; it never names what kind of person typed it.
- **Any score, level or maturity rating.**
- **Anything from a participant not reproduced verbatim from the findings.**
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
