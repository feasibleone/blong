---
name: blong-ci
description:
    Diagnose a CI run of the blong monorepo — what failed, why, and whether it is a regression or a
    runner that was slow — through the `blong-dev ci` command and the reports site. Use this skill
    whenever the user asks what failed in a build, whether the release pull request is green, why
    GitHub says the tests are red, or to check the CI after a push — even if they just say "check
    the failure in the last build", "the build is red" or "is the release out yet". For the report
    pipeline that produces and publishes those documents use blong-log-dev; for the local dev loop
    itself see docs/blong/docs/patterns/blong-dev.md.
---

# blong-ci Skill

## What this skill covers

Answering one question: **what failed in a CI run, and why**. The work is:

- run one command and read its answer — not curl the reports site, not `gh run download` by hand,
- interpret what the tool says in this repository's own vocabulary (`timeout!`, `expired:`, a
  leg-gap, provenance against the base branch),
- decide whether the run is _this branch's doing_ or a shared runner that was slower,
- say what the evidence does **not** cover, rather than closing the gap with a guess.

The command exists because answering this took thirty-five tool calls by hand: the failure bundle
names the tests but not the reason, the run's own summary names operations the bundle omits, and the
reason itself lives in a raw TAP stream inside a 44MB artifact (@@F-539, @@D-561).

## Quick Reference

```bash
blong-dev ci failures                    # the release-please PR, its newest completed run
blong-dev ci failures --pr 200           # another pull request
blong-dev ci failures --run 622          # one run by number (`blong-dev ci 622` also works)
blong-dev ci failures --sha 776c9c60     # the newest run of a commit
blong-dev ci failures --branch main      # the newest run of a branch
blong-dev ci failures --full             # + read the reasons out of the reports artifact
blong-dev ci failures --json             # the machine document, for another tool or agent
blong-dev ci failures --write            # stamp `ci-diagnosis.md` with the same answer
blong-dev ci runs --limit 10             # recent runs and which packages failed in each
blong-dev ci history blong-cli           # one package: pass/fail and test time, run by run
blong-dev ci history blong-cli blong-kukum   # several at once, which is what a red run needs
```

The default answer is read-only and cheap: the published bundle plus the run's job log. `--full`
downloads the `reports` artifact (tens of MB) and reads the raw streams — it is what answers _why_
for a failure the bundle only named.

## The default target

With no flag the command diagnoses **the release-please pull request** — pushing to main opens one
and it is the run that decides whether a release can go out — and says which run it picked and what
it passed over. A run that is in progress or was cancelled published nothing, so it is skipped and
named rather than silently used.

Without an authenticated `gh` there is no run list: the tool falls back to the `latest` bundle on
the reports site, which is the newest run that had _anything_ to report — a flaky test counts, and a
later clean run publishes nothing — not necessarily the newest run. It says so; read that line
before reporting anything.

A bundle is not a verdict, and its existence does not make a run red: **red means a test failed**. A
run whose only entry is flaky is green, and the answer says `N flaky test(s), no failure` — the case
that made this rule is #621, a successful run whose bundle holds one retried test.

## Interpreting the answer

| What you see                                              | What it means                                                                            | What to do                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `timeout: the run's own budget expired…`                  | tap's `t.setTimeout` budget expired, not a hang                                          | find the number: an in-file `setTimeout(60_000)` overrides the runner's `--timeout=240` (@@D-247)                                     |
| `not ok N - timeout!` + `expired: TAP`                    | the budget of one **test** expired                                                       | read the excerpt: which assertion was last, what handle was still open                                                                |
| `expired: <file>.test.ts`                                 | the budget of the whole **file** expired                                                 | the file, not one test, ran out of time — usually spawns or a platform cold start                                                     |
| `still open when the budget expired: … ChildProcess×1`    | the test was waiting on something it spawned                                             | look at what the test spawns (a linter, a server, a browser), not for a deadlock                                                      |
| `tap exited with code 1 without reporting a failing test` | tap writes its report _before_ its verdict, so a killed run leaves the failure out of it | the reason is only in `tap.raw.tap`; `--full` reads it                                                                                |
| `ERROR: incomplete … coverage` beside a failure           | a **consequence** of the aborted test                                                    | never the cause; do not chase coverage                                                                                                |
| verdict `leg-gap`                                         | an operation failed while the bundle has nothing for it                                  | a package with two legs must publish a slice per leg (`blong-dev report jest --runner storybook`)                                     |
| verdict `snapshot-mismatch`                               | a committed image differs from the rendered frame by the percentage it names             | read the `-diff.png` beside the snapshot: a story that streams on a timer or shows a date shoots a different frame on a slower runner |
| status `flaky`                                            | a retry passed                                                                           | not a failure; it is a signal about the test, not the build                                                                           |
| `new-failure` / `recurring`                               | provenance against the base branch                                                       | `new` means main was green on it, which is what a reviewer wants first                                                                |
| `unknown` verdict                                         | nothing in the evidence points at a cause                                                | say so, and record what would settle it — do not invent one                                                                           |

## Is it us, or the runner?

The `prior` line is the whole answer to this question: the same package in its previous _published_
run. A file that was green at 27s and red at 70s with an expiry is a runner that was slower, and the
finding is a budget or a fixture rather than broken code. Two numbers matter and both are in the
answer — the previous run's test time and this one's operation time.

`blong-dev ci history <package>` gives the same comparison over more runs, which is how a slow trend
is told from a single bad run. Build #622 is the worked example: two expired budgets and one
timing-dependent snapshot, on a runner two to three times slower than #621, with no code at fault
(@@F-540).

## What your answer must contain

1. **Which run** and how it was chosen (`how`), with the run URL.
2. **Per failing package**: the test and its location, and the leg it failed under.
3. **The reason verbatim** — the excerpt the tool printed, not a paraphrase of it.
4. **The verdict and the numbers behind it**; `unknown` is a legitimate finding.
5. **The comparison** with the previous published run.
6. **What the tool could not see** — its `note` lines, the missing artifact, an unreadable log.

Report it as it printed. A diagnosis re-worded into confidence is worth less than the raw excerpt,
and a reader who has to open the artifact to understand the answer has been sent back to the work
this command replaced.

## Limits and obligations

- **Never post to the pull request, re-run a job, or change a budget as part of reporting it.** Say
  what you would change and why, and let the user decide.
- **`--full` is a download.** The unpacked artifact is cached under the gitignored `dev/ci/<run>/`
  and reused, so a second look is offline.
- **A gap in the answer is a finding about the tooling.** If a failure arrived with no reason, if a
  leg was missing, or if a call had to be made that the command should have made, record it —
  [Self-improvement](#self-improvement) says where it belongs and what to do with it. That is how
  this command came to exist.
- **The site keeps fifteen runs** (`keep-reports: '15'`). A comparison older than that is not
  available, and `ci history` says nothing rather than guessing.

## Extending the tool

The command lives in `tools/blong-dev/src/ci/`, one module per question, with tests beside them:

| Module          | Question it answers                                                             |
| --------------- | ------------------------------------------------------------------------------- |
| `gh.ts`         | what only GitHub knows: job lists, job logs, artifacts, auth                    |
| `site.ts`       | what the reports site published: the failure bundle, a package's page for a run |
| `target.ts`     | which run this is about (`--pr`, `--run`, `--sha`, the release-please default)  |
| `operations.ts` | the run's own operation summary, read from the job log                          |
| `evidence.ts`   | the reasons inside a downloaded artifact: raw TAP, a leg's jest log             |
| `classify.ts`   | the verdict, and the numbers it rests on                                        |
| `diagnose.ts`   | the assembly of all of the above into one document                              |
| `render.ts`     | the console view, the JSON contract and the markdown file                       |

The report documents themselves are produced by `blong-dev ci-report` — the bundle's fields, the
per-package page and its embedded summary. Change them together: `failuresBundle.ts` and
`packagePage.ts` are what this command reads.

## Testing a change to this path

**The fixtures decide correctness.** Run 622 of `Build` is the fixture and 621 is its green
counterpart:

```bash
blong-dev ci failures --run 622 --full      # three failing operations, two expired budgets,
                                            # one timing-dependent snapshot, one leg-gap
blong-dev ci history blong-cli --limit 5    # #621 green at 27s, #622 red at 1m 10s
blong-dev test "src/ci/*.test.ts"           # the parsers and the assembly, from unit fixtures
BLONG_CI_ACCEPTANCE=full blong-dev test "src/ci/acceptance.test.ts"   # the command against 622
```

Run the whole set whenever the bundle's schema, the per-package page, the package summary or the job
log's summary changes: every part of this command parses something another command writes. The
acceptance test is opt-in because it needs the network, and it downloads nothing unless its `full`
leg is asked for.

**A fresh-context subagent decides usefulness**, which correctness does not. The question is whether
an agent that has never seen this work answers in one or two calls; the recipe, and the reason for
each part:

- **Prompt exactly what a user would type**, and nothing else:
  `check the failure in the last build of blong`. No mention of the skill, the command, the run
  number or this page — if the prompt names the tool, the test proves nothing about whether this
  page's description routes an agent to it.
- **Ask for the answer _and_ the commands it ran**, which is the only instrument:
  `reply with what failed and why, and the exact commands you ran, in order`. That asks for a
  transcript, not for a particular command.
- **Run it twice.** One sample of routing behaviour proves nothing; the first validation's two runs
  both loaded this skill and both reached for the same command, which is what made that a result
  rather than a coincidence.
- **Keep the ground truth out of the prompt.** 622 is red with three failing operations; 621 is
  green, and its bundle holds one flaky retry and nothing else. Judge the answer against the truth
  you fetch independently — a subagent's claim to have found something is never the evidence.
- **Run the variants**, because they exercise different paths: the default prompt; an explicit run
  (`check the CI failure in run 618`); a green run (`was build 621 green?`); and a run whose causes
  were never captured, where the honest answer is `unknown` plus the reason the tool cannot do
  better.
- **Count what it cost** — tool calls and turns, against the last measurement: the fidelity variant
  cost nine to ten calls and five turns for 622's shape against thirty-five by hand, and the green
  variant three commands once the flaky rule was fixed (`@@F-546`). A regression in that number is a
  finding, and so is a reduction nobody asked for.

What a pass looks like:

| Criterion                                                                                | Why it is in the list                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| at most 4 tool calls and 2 turns for a run the reports describe                          | the promise, against the 35-call baseline         |
| this skill was loaded                                                                    | the description routed, which is what it is for   |
| `blong-dev ci failures` was the first thing reached for                                  | not `curl`, not `gh run download`                 |
| the failing operations, their reasons and the prior-run comparison are all in the answer | the output contract above                         |
| the verdict names a budget, a file or a leg — never "the tests hang"                     | a hypothesis with its numbers                     |
| nothing is invented: an unexplained failure is `unknown`, with what would settle it      | the discipline that makes a diagnosis trustworthy |

**Every deviation is data.** A call the agent had to make that the tool should have made is a tool
gap; a step it improvised is a gap in this page. Both go into the loop below — the first validation
produced three real defects and one gap that needs a live failing run to settle (`@@F-542`,
`@@F-544`, `@@F-545`, `@@F-543`).

## Self-improvement

This command and this page are the record of one investigation: answering "what failed in the last
build" cost thirty-five tool calls by hand, and every call that was not judgement became a line of
code (`@@D-561`). The loop that produced it is the job of whoever uses the skill next:

1. **Record the gap where you hit it** —
   `blong-dev memory add friction|todo --area ci --title … --body …`, naming the run, the command
   and what you had to do instead. "The tool is awkward" helps nobody; "`ci failures` hid the
   per-leg counts, so I ran `--json` and read it with python" is a change waiting to happen. Search
   first: `blong-dev memory search "<the question you had>"`, because a gap like `@@F-543` or
   `@@F-545` was recorded before it was fixed.
2. **Fix the smallest thing that removes the call** — usually the tool, sometimes the report it
   reads. A reason that exists nowhere the run publishes is a publisher problem (`report/`), not a
   display problem.
3. **Leave a fixture** — a case in the module's test, and, when the shape is new, a line in the
   acceptance run.
4. **Re-run the test above** before calling it done, and describe what changed in the answer, not
   only in the code.
5. **Close the entry** with `--note` naming the change, and cite the _decision_ from the code rather
   than the friction the change resolved: a resolved friction stays the record of the problem and
   the decision holds the reasoning (`@@D-562` was written for exactly this).

A gap is sorted by what it needs, because the two halves live in different places:

| What you noticed                                                     | Where the fix belongs                                                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| a call you had to make that the command should have made             | the verb or the renderer (`tools/blong-dev/src/ci/`)                                                                       |
| a verdict that reads as a claim rather than as the numbers behind it | `classify.ts`: a new `VerdictKind` with its reason, a row in the table above, a case in `classify.test.ts`                 |
| a reason the reports do not carry at all                             | the publisher (`report/`): `failures.json`, the package page and its summary are the contract every package contributes to |
| a failure shape the interpretation table does not name               | this page: the row, and the verdict it should produce                                                                      |
| a step neither the tool nor this page described                      | the output contract or the limits above                                                                                    |
| something that took a second run to understand                       | the lines the tool prints — make it print them                                                                             |

## Lessons learned

Each of these cost a cycle, in the investigation that built the command or in the validation that
followed it:

- **A bundle's existence is not a failure.** The report pipeline publishes one for any problem, and
  a flaky retry is a problem to it while the run itself is green — reading existence as "red" told a
  reader a release was blocked when it was not (`@@F-544`). Red means a failed test.
- **"Timeout" without the budget is not an answer.** The budget, the file that sets it and the
  previous run's time are what separate a slow runner from broken code (`@@D-247`, `@@F-540`).
- **The failure's shape sets the budget.** A run the reports describe is one or two calls; a run
  whose failures died while loading, leaving their reason nowhere, is archaeology no tool can
  shorten (`@@F-543`). Say which of the two you are in.
- **A report written before a verdict cannot hold the verdict.** tap writes `tap.json` before its
  own exit, so a killed file leaves its failure out of the JSON entirely and the raw stream is the
  only witness; the coverage errors beside it are the consequence, never the cause.
- **A leg that publishes nothing is invisible.** Cross-check the run's own operation summary, which
  names what the bundle does not (`@@F-539`) — and when the missing leg is fixed at the source, keep
  the safety net and test that the two agree.
- **A published name may already be taken.** Allure writes its own `summary.json` into the directory
  our page is published to; publish the machine summary under our own name beside it rather than
  reading a 4.3MB single-file report for one number (`@@D-562`).
- **Label where a reason came from** — the bundle, the artifact, the runner's stderr. A reader who
  cannot tell which document was read cannot weigh it.
- **The measurement is part of the result.** The validation's call count is the number this work is
  judged by, and a flake in a suite that reads the real repository is not your regression
  (`@@F-546`, `@@F-547`).
