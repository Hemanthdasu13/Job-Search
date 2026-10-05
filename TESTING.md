# Running a test conversation

Written for a Claude Code session on Hemanth's own machine, because a cloud
session cannot reach the deployed site: the organisation's network policy
denies `vercel.app`, and that applies to curl and to a headless browser
alike. On a desktop session there is no such proxy and everything below just
works.

## The shortest path, for someone who does not want to install anything

Two scripts in here - `walk-live.mjs` and `replay.mjs` - import nothing but
Node's own modules and `_rules.mjs` next to them. No `npm install`, no build,
no API key. All they need is Node and a machine that can reach the site,
which any normal laptop is.

So the whole thing is:

1. Install Node from nodejs.org if `node --version` says nothing. The macOS
   installer is fine; nothing here needs a particular version beyond Node 18.
2. Get this branch as a folder: on GitHub, switch to
   `claude/ai-verification-tool-e50b54`, then Code -> Download ZIP, and
   unzip it.
3. Open Terminal, `cd` into the unzipped folder.
4. Run the command below and paste what it prints.

That produces a full conversation against production with every question
checked against the form rules, which is the thing a cloud session cannot do.
Nobody needs to be given access to anything.

`npm install` is only needed for `verify-parse` and `simulate`, which bring in
the Anthropic SDK, and `playwright-core` is only needed to drive a browser.
Neither is needed to test the live site.

## The quickest useful thing

```bash
node scripts/walk-live.mjs --base https://reliance-layer.vercel.app --pin 130115 --say "I was using it to recommend me for a restaurant/ pub near soho"
```

One conversation against production, roughly 4p. Every question comes back
with the form rules applied, so a question that asks two things, runs over
twenty words, carries a dash aside or presupposes an action is reported
rather than noticed by eye three runs later.

For many runs at once, point it at the targeted scenario set instead of
typing an opener:

```bash
node scripts/walk-live.mjs --base https://reliance-layer.vercel.app --pin 130115 --scenario T1,T6,T11,T16
```

## Replaying a real conversation against a new prompt

```bash
node scripts/replay.mjs --base https://reliance-layer.vercel.app --pin 130115
```

Feeds the answers from `evals/replays.json` back in and prints the new
question beside the one the person actually got. Turn one is a fair
comparison, because the opening account is the same text either way; later
turns feed a reply to a question that was never asked, so read those for how
the question is worded rather than for whether it followed on.

## Driving the real page in a real browser

Only worth it to see the rendering - the layout, the caveat, the closing
screens - because for test runs the scripts above are faster and apply the
rules automatically. A browser shows one conversation in two minutes; the
scripts do twenty in one.

To drive the Chrome already open on screen, start it with remote debugging
and attach to it, rather than letting Playwright launch its own:

```bash
# macOS - quit Chrome first, then:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

npm i -D playwright-core
```

```js
import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0];
await page.goto("https://reliance-layer.vercel.app");
```

Everything then happens in the window he is watching.

## What to look for, as of v0.4.0

The question rules changed in 0.4.0 after a logged conversation showed five
of six questions presupposing a deficit. So:

- Does any question assume he did something he did not do? "What did you
  weigh it against" was the one that broke it, answered "I cannot weigh,
  I'm new to the place."
- Does any question introduce a noun he never used? The old one offered
  "recently" and "reputation", neither of which was his, and both of which
  are ways of being inadequate.
- Does it stop at four questions? The cap went from six to four.
- Did the caveat render at the bottom of the closing screen?
- **Did a reflection come back, or is it still null?** This is the known
  open bug. The prompt only asks for one on status `reached` or `verified`,
  so a conversation that runs to the turn cap ends with no summary at all -
  which is the thing he said was missing, and the reason the ledger is the
  next piece of work.

## Local, with no deployment involved

```bash
MODEL_API_KEY=... STUB=0 node dev.mjs          # real handler, real provider
node scripts/replay.mjs --base http://127.0.0.1:3000
node dev.mjs                                   # stubbed, spends nothing
```

## What needs no network at all

```bash
node scripts/verify-questions.mjs   # the question rules, pinned to real questions
node scripts/verify-voice.mjs       # one noun: "the research"
node scripts/verify-quotes.mjs      # no uncleared participant quote ships
node scripts/verify-parse.mjs       # reply shapes the extractor must survive
node scripts/verify-paste.mjs       # the pasted-answer heuristic
node scripts/verify-targets.mjs     # bucket T's shape
node scripts/simulate.mjs           # five whole-system walks, fake provider
```
