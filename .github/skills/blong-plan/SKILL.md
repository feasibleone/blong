---
name: blong-plan
description:
    Write, keep and execute a Blong implementation plan — the `plans/<slug>/plan.md` format, the
    task line `blong-dev plan` parses, the front matter, and the tooling that turns an approved plan
    into memory tasks, a GitHub issue and a Slack channel. Covers drafting and the approval command,
    then working one task at a time (read the detail, close it, record decisions and frictions with
    `--plan`), syncing the board and the issue, and closing the plan out. Use this skill whenever an
    explicit plan exists or is asked for — `plans/<slug>/plan.md` named in the task, a plan handed
    over to execute, a task whose detail lives in a memory entry, or any work tracked through
    `blong-dev plan` — even if the words "plan file" or "todo entry" are not used.
---

# Blong plan — the format, the board and the tooling

A plan is not a document written once. It is a board the owner watches, a set of memory tasks the
executing agent works through, and a GitHub issue the rest of the team reads. This skill carries the
**format and the tooling**, which are the same before and after approval (@@D-824); the planning
craft — what makes a plan reviewable — belongs to the
[blong-planner agent](../../agents/blong-planner.agent.md).

Two moments use it:

- **Writing one** — draft it from the template below, get it approved, run one command to publish
  it.
- **Executing one** — `plans/<slug>/plan.md` exists and its tasks are memory entries. Read the
  detail from the entry, close tasks as they land, record decisions and frictions on the board, and
  keep the issue and the channel in step.

## The file layout

One folder per plan, `plans/<slug>/`, holding what the plan was asked to answer and what it decided.

```text
plans/<slug>/
├── plan.md            the plan — front matter, sections, work breakdown
├── plan.prompt.md     the request it answers, verbatim
└── <support>.md       evidence, measurements, source material the plan consults
```

`plans/` is gitignored: the plan is local and the GitHub issue is the shared copy. Never move a plan
into a package, and never edit a plan's progress by hand — `blong-dev plan` and
`blong-dev memory close` own the checkboxes.

## What the front matter holds

`plan init` writes it, and `plan sync` fills in a key it finds missing:

```yaml
slug: plan-workflow
title: Plan workflow — tracking, issues and Slack
status: approved # or `draft`
repo: feasibleone/blong
issue: 250
issueUrl: https://github.com/feasibleone/blong/issues/250
platform: slack
account: blong-bot
channelName: plan-workflow
conversationId: C0CGV5Y70LS
channelUrl: https://slack.com/app_redirect?channel=C0CGV5Y70LS
created: 2026-11-11
approved: 2026-11-11
```

`conversationId` is what `chat.prompt.ask` addresses and `channelUrl` is where a person opens the
channel; both are recorded so the plan answers "where is the conversation" without a lookup. The
issue link leads the channel's topic, so a reader who lands in Slack can click straight to it. A
plan whose `status` is `approved` is the active one; the newest is the one being executed.

## The plan document

Use these sections in this order. Skip one only when it would be empty, and say why in `Tracking`.
Keep each section to what its reader needs: the owner deciding, and the agent executing. A
measurement table, a long transcript or a design essay belongs in a support file the plan cites, not
in the plan.

````text
# <Title> — implementation plan

<One paragraph: what this plan builds and the decision ids it rests on.>

**Status: draft.** <what approval needs to settle, or the answers that shaped it>

## 1. Overview

**The problem.** <what is broken or missing, in Blong terms>

**What we are building.** <the realm/layer/package boundary in one paragraph>

**Done means.**

- <a verifiable sentence — a command, a passing test, a visible behaviour>
- <one per acceptance criterion>

## 2. Technical approach

### Decisions this plan takes

- <The choice, as a statement> · area: <package folder or reserved area>

    <Why this and not the alternative. The consequence a later reader needs.>

- <The next choice> · area: <area>

    <Why.>

### Where the capability lands

- **<concern>** — `core/blong-gogo`, `src/adapter/server/<file>.ts` (<decision>)
- **<concern>** — `realm/<realm>`, `<layer>/<group>/` (<decision>)

### <The shape that needs explaining>

<The handler vocabulary, the table set, the configuration block, the sequence — with the reasoning
that is not obvious from the code.>

### Configuration

```yaml
# realm/<realm>/.blong_devrc
<the keys a deployment sets, with one comment each>
```

## 3. Work breakdown

### Group 1: Foundation — <what it makes true>

- [ ] <Task title> · area: <package folder or reserved area>

    <What to change, where, and how it is verified. This is the detail that moves to memory.>

    - verify: `<exact command or assertion>`

- [ ] <Task title> · area: <area>

    <detail>

### Group 2: Functionality — <what it makes true>

- [ ] <Task title> · area: <area>

    <detail>

### Group 3: Tests

- [ ] <Task title> · area: <area>

    <detail>

### Group 4: Docs

- [ ] <Task title> · area: docs

    <detail>

## 4. Tracking

Where the plan lives, where its issue and channel are, and the order the groups land in. Every task
above becomes a memory todo when the plan is approved.

## 5. Considerations

**Assumptions.** <what the plan takes as given, each falsifiable>

**Constraints.** <framework rules, deployment limits, credentials, ports that shape the design>

**Risks.** <what could make it fail, and the mitigation or the test that would catch it>

**Not included.** <what was deliberately deferred, with the todo or decision that records it>
````

`## Decisions and frictions` is the one section the tool writes rather than the author: the first
`memory add … --plan <slug>` appends it, and `plan sync` keeps every line it holds in step with the
entry. Do not draft it by hand, and do not move it — the section is found by its heading.

### The decisions list

A plan makes choices before it is approved — which store, which layer, which default — and they used
to live in the prose, which meant that by the time the work started nobody could cite them. List
them instead, as the first subsection of `## 2. Technical approach`:

```text
### Decisions this plan takes

- A blob is addressed by a scope, not a namespace · area: realm/blong-blob

    A scope is what the cookie carries, so a read proves the caller owns the bytes. A
    namespace would have to be checked against the party on every request.

- The upload route asks for its stream body · area: core/blong-gogo

    A parser registered at the root makes every route accept what it cannot read.
```

- A decision is `- <title> · area: <area>` — a plain bullet, never a checkbox, so the task parser
  ignores it. Its detail is a blank line and then a paragraph indented four spaces, in the same
  shape a task uses.
- The heading is exactly `### Decisions this plan takes` (level 2–4). The list ends at the next
  heading of the same or a higher level, so keep the whole list in one block.
- `plan init` (and `plan tasks --apply`) creates one `D-` entry per line, moves the detail into it
  and leaves `- [@@D-861](link) <title>` behind — exactly what happens to a task. `--no-decisions`
  leaves the list as prose; there is no reason to use it.
- Nothing here is a second board: `plan check` reports an uncreated or drifted decision, `plan sync`
  re-renders its line, and `plan status` counts it beside the execution-time entries.

A decision taken _while the plan is executed_ is not added here — it goes in with
`memory add decision --plan <slug>`, which lists it on the board the tool owns. The difference is
what a reader is looking for: this list is the approach's premises, the board is the record of what
changed on the way.

### The task line

The work breakdown is a contract `blong-dev plan tasks` parses, so it is stricter than the prose
around it:

- One task is one **scoped change** with its own verification, not a phase.
- A task line is `- [ ] <title> · area: <area>`. The title becomes the memory entry's title and is
  limited to 100 characters; the area is a package folder (`realm/blong-agent`, `core/blong-gogo`)
  or a reserved root area (`docs`, `skills`, `ci`, `cross-cutting`).
- **The title names the thing, not its position.**
  `Verify the store is a configuration value, not a code path` — not `Group 3 verification`, which
  is the same title in every plan, so two entries carry it and neither can be found by search. The
  entry is read on its own, long after the group numbering is gone; `plan check` reports a
  positional title and one that repeats an existing entry's.
- The detail is a **blank line** and then a paragraph **indented four spaces** — the shape prettier
  leaves alone, since it re-flows a lazy continuation into the title's paragraph and glues a
  `- verify:` to the prose above it. It becomes the entry's body, so it may hold paragraphs, lists,
  fenced snippets and a `- verify:` item of its own — but **never a heading**, because a memory
  entry holds prose, not sections.
- **A title may be wrapped by the formatter, and the parser reads it as one line.** Prettier
  re-wraps anything past its print width at a space, so a long title ends with `· area:` and its
  value on the next indented line; everything up to the first blank line belongs to the title, and
  the detail starts after it. Write the title on one line; do not shorten it to dodge the wrap.
- A checkbox outside the work breakdown is not a task. Keep decision lists and other checklists in
  plain bullets.
- A decision line is the same contract without the checkbox: `- <title> · area: <area>` with its
  detail indented. See [The decisions list](#the-decisions-list).
- Never put an `@@T-` reference on a task yourself: `plan tasks` writes it, and `memory close` flips
  the box through it.

After approval the same lines read:

```markdown
<!-- prettier-ignore -->
- [ ] [@@T-531 Scaffold the realm](../../realm/blong-agent/.github/memory/todo.md#t-531--scaffold-the-realm)
```

The title inside the link to the entry, because a token a reader has to search for is a worse table
of contents than a link. `plan check` reports a task that names its entry without one, and
`plan sync` writes it. The issue published from the plan rewrites the same link to a github.com URL,
so the issue is navigable too. To change the detail, change the memory entry (`memory edit`), never
the plan.

The `<!-- prettier-ignore -->` above a list is written by `spaceOutPlan` and never by hand: a
long title makes a long line, and a formatter that re-wrapped it would split the link across two
lines, which the board reads as two tasks. One guard covers a whole list; prose, headings and
tables stay the formatter's.

### What a good task says

- **Where**, by path and symbol, so the executing agent does not have to rediscover it.
- **Why**, when the change is not obvious from the code — with the decision id.
- **How it is verified**, as an exact command (`blong-dev test`, `blong ./realm/x/index.ts`,
  `blong-dev sql "…"`) or an assertion a test will make.
- **What it must not break** — the existing behaviour the release relies on.
- **A title that stands alone**, because it outlives the plan: the group it was written under, the
  numbering, and the order are all gone by the time someone searches for it.

## Publishing it: one command on approval

```bash
blong-dev plan init <slug> --repo feasibleone/blong --invite <slackUserId>
```

**Pass `--invite` with the owner's Slack member id** (`U…`, never the email). The channel is
private, so an invite nobody received means a channel nobody can open — and the invitation cannot be
added later: Slack answers `name_taken` for the name, and the chat realm has no route that invites
into an existing channel. `plan init` warns when the list is empty for exactly that reason, and
reads `plan.invite` from `.blong_callrc` when the flag is absent — the id is a fact about the person
rather than about the plan, so it is recorded there once and every plan afterwards inherits it. If
the id is not to hand, Slack's member list in the workspace admin shows it, or the owner invites
themselves from the channel's _Add people_ dialog once somebody has opened it.

It creates a memory todo per task and a `D-` entry per decision, trims the plan to titles plus
linked `@@T-…` / `@@D-…` references, mirrors the plan into a GitHub issue, opens the plan's private
Slack channel and records the issue, the conversation id and the channel link in the front matter.
From then on the plan is the board and the memory is the detail. An issue that already exists is
adopted with `--issue <url>` instead of being created. `blong-dev plan init --help` lists the rest —
the issue label, the channel (name, target, account), `--draft`, and the skips (`--no-issue`,
`--no-slack`, `--no-tasks`, `--no-decisions`).

## Executing it: one task at a time

1. **Read the detail** from the entry, not from the plan: `blong-dev memory show @@T-xxx`. After
   approval the plan keeps titles; the reasoning is in the entry. A decision the entry cites is
   already recorded — read it (`memory show @@D-xxx`) and follow it rather than taking it again.
2. **Do the work** the entry describes, including its `verify:` command.
3. **Close it**: `blong-dev memory close @@T-xxx --note "<what landed>"`. The close ticks the plan's
   box and keeps the entry's detail.
4. **Record what the work taught** as a decision or a friction, with `--plan <slug>`, which lists it
   on the board:

    ```bash
    blong-dev memory add decision --title "<choice>" --area <area> --body-file <file> --plan <slug>
    blong-dev memory add friction --title "<what cost effort>" --area <area> --plan <slug>
    ```

    The entry is written as usual and a linked line joins the plan's `## Decisions and frictions`
    section; `memory close` rewrites the status there, and `plan sync` re-reads the whole section. A
    todo is never listed this way — it belongs in the work breakdown, so `memory add todo --plan` is
    refused.

    **The flag is not optional while a plan is active.** `plan init` and `plan sync` record the plan
    being executed in `plans/active.json`, and `memory add` for a decision or a friction then fails
    on a call that says neither `--plan <slug>` nor `--no-plan`, naming the plan and both flags
    (@@D-916). `--no-plan` is for an entry that genuinely belongs to no plan — the tooling, or a
    finding made outside the work — and is the sentence that says so rather than a silent omission.

5. **Sync** after a batch and before handing over: `blong-dev plan sync <slug>`, and
   `blong-dev plan status <slug>` for the one-screen progress the owner reads.

A question asked while executing goes to the plan's channel, whose id is the front matter's
`conversationId` — the [blong-ask skill](../blong-ask/SKILL.md) carries the call, the surfaces and
the timeout.

## Continuity

When executing a plan, at the end of the turn, you need to ask the user how to continue via the
question asking tool and provide a list of options (check boxes or buttons), or just continue / stop
for review buttons. The continue will mean continue as per the plan. If you get answer that the user
is away, repeat the question in chat with blong-ask.

### What executing a plan has taught

- **A `verify:` command runs from the package that owns the tool, and names the gate that can
  fail.** `npx tap` from the repository root tries to install tap and blocks on a prompt; the same
  command from the package that declares it runs. A task that adds a file to a publishing package
  owes two things a package-local test run never checks: the file in the package's `.npmignore`
  allow-list, and `tools/blong-dev/src/publish/publishGuard.test.ts`, which packs the tarball a
  consumer would get — the blob plan's `blob.ts` was declared in `exports` and shipped to nobody
  while every test it listed passed (@@F-746).
- **A baseline is a picture of a state, not of the screen.** A screenshot that captures whatever a
  previous run left — a register with rows in it, a dialog carrying its history — passes today and
  fails tomorrow. Make the state deterministic in the spec (purge first, capture the empty register)
  or leave the capture out.
- **A lint finding is not a decision.** Markdown repair is `blong-dev lint --fix --files <paths>`,
  which is the editor's formatter; a paragraph re-wrapped or a table re-aligned by hand is work the
  tool would have done, and a script that does it is worse. Confirm the fix landed (`git diff`) —
  prettier silently skips an ignored path.
- **The plan is not the place to correct the detail.** A task that turned out wrong is corrected in
  its entry (`memory edit`), and `plan sync` carries the title back. Editing the plan risks the two
  saying different things, which is what `plan check` then reports.
- **A created task is one line, and its title is the link text** — `- [ ] [@@T-531 <title>](…)`
  under a `<!-- prettier-ignore -->` the tooling writes (@@D-917 @@D-919). The two-line form this
  replaced — the link, then the title indented under it — wrapped at the formatter's whim, and the
  next render then could not tell a wrap from a leftover: that is how titles came to be written two
  and three times in one plan (@@F-768). `plan sync` compares a block line by line, so a wrapped
  leftover is repaired rather than preserved.

## Closing it out

The last thing a plan asks is what happens after it. Post the summary as a message — it is a record,
not a question — then ask the next step as a single choice with an escape hatch, and finish with a
confirmation, which is what separates "I read it" from "close it":

```bash
blong-dev call chat.out.messageSend '{
  conversationId: C0ABCDEF,
  text: "*Done — plan agent* 6/6 tasks, 0 problems, issue #247 is green.\n• The rule landed in `configValidation.ts`\n• Two frictions, both resolved\n• The deployed realm runs the same artifact"
}'
blong-dev call chat.prompt.ask '{
  conversationId: C0ABCDEF, kind: choice,
  text: "What happens next?",
  placeholder: "Something else",
  options: [
    {value: review, label: "Review the diff before anything else"},
    {value: follow-up, label: "Open a follow-up plan for the deferred items"},
    {value: stop, label: "Stop here — nothing else for now"}
  ]
}'
blong-dev call chat.prompt.ask '{conversationId: C0ABCDEF, kind: confirm, text: "Close the plan and tick its remaining tasks?"}'
```

The answer's `value` is what code switches on, so the plan names it once and never rewords it; the
shapes and the rest of the rules are in the [blong-ask skill](../blong-ask/SKILL.md).

## Adopting work that exists

A plan may cover work that is already tracked. Adopt rather than duplicate:

- A memory task, friction or decision — `blong-dev plan adopt <slug> @@T-123 @@F-045`. A todo
  becomes a task line the plan's progress follows; a friction or decision is listed as adopted
  context.
- An issue that already exists — `blong-dev plan init <slug> --issue <url>`, or
  `blong-dev plan adopt <slug> --issue <url>` once the plan is approved.
- A plan that inherits another plan's unfinished group — adopt its ids and say in `Tracking` which
  plan they came from.

Never create a second entry for work an existing entry already describes; a duplicate is what makes
`memory audit` useless.

## Before calling a plan done

- `blong-dev plan check <slug>` — every task created, every entry present, titles aligned, every
  task line linked to its entry.
- `blong-dev plan status <slug>` — the progress line the owner reads, with the issue and channel
  links.
- `blong-dev plan sync <slug>` — the plan and its issue say what the memory says. `--channel`
  re-applies the channel topic, which is the issue link a reader clicks; `--help` lists the flags.
- `blong-dev memory check --refs` and `blong-dev memory refs --dangling` — a reference that does not
  resolve blocks the change like a failing test.
- `blong-dev memory comply` — the plan's citations of an entry this change edited still hold.
