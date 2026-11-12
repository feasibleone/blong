# Plan tracking

How a plan is written, approved, executed and reported. A plan is three things at once: a local
markdown board the owner watches, a set of memory tasks the executing agent works through, and a
GitHub issue plus Slack channel the rest of the team can read. For the memory format itself see the
[memory pattern](memory); for the agent that writes plans see the `blong-planner` agent.

## The file layout

```text
plans/<slug>/
├── plan.md            the plan — front matter, sections, work breakdown
├── plan.prompt.md     the request it answers, verbatim
└── <support>.md       evidence, measurements, source material the plan consults
```

`plans/` is gitignored. The local file is the source; the issue is the shared copy, and `plan sync`
is what republishes it.

## The work breakdown is a contract

Before approval a task carries its detail, because that is when the detail is being reasoned about:

```text
### Group 1: Foundation — the realm exists

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with `kukum realm add --subject=agent`.

      - verify: `blong ./realm/blong-agent/index.ts` starts

- [ ] Write the pattern page · area: docs
      One page describing the engine port.
```

- `- [ ] <title> · area: <area>` is the only task form the tooling reads.
- The title is at most 80 characters, because it becomes the memory entry's title.
- The area is a package folder (`realm/blong-agent`, `core/blong-gogo`) or a reserved root area
  (`docs`, `skills`, `ci`, `cross-cutting`).
- The detail is every following line that is indented or blank. It may hold paragraphs, lists,
  fenced snippets and `- verify:` lines — but **no heading**, because a memory entry holds prose,
  and `plan tasks` refuses one that would break the file it writes.
- A checkbox inside a fenced block is not a task; a checkbox outside the work breakdown is not one
  either, so keep non-work checklists as plain bullets.
- Two tasks may not share a title: the title is how a reader finds the entry.

After `blong-dev plan tasks --apply` the same block is one line, and the detail is in memory:

```markdown
- [ ] [@@T-531](../../realm/blong-agent/.github/memory/todo.md#t-531--scaffold-the-realm) Scaffold
      the realm
- [ ] [@@T-532](../../docs/.github/memory/todo.md#t-532--write-the-pattern-page) Write the pattern
      page
```

The `@@T-` token is the link in both directions, and it is written as a markdown link rather than a
bare token: `memory show @@T-531` answers the detail, `memory close @@T-531` ticks the box, and a
reader of the plan clicks straight into the entry. The target is relative to the plan's own folder
(`../../` reaches the repository root from `plans/<slug>/`) and anchored on the entry's heading — an
em dash is dropped and the spaces around it leave two hyphens, so `### T-531 — Scaffold the realm`
anchors as `t-531--scaffold-the-realm`.

The same link reaches GitHub. The plan is local, but the issue published from it is not, and GitHub
resolves a relative link in an issue body from the repository root — so `plan sync` rewrites each
target to `https://github.com/<repo>/blob/HEAD/<path>#<anchor>` on the way out. A bare `@@T-531` is
still parsed (a plan written before the link form must not stop working), and `plan check` reports
one: `sync` writes the link.

## The commands

| Command                       | What it does                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `plan check <plan>`           | Parses the plan; reports a task with no area, a drift, a missing or bare link   |
| `plan tasks <plan> [--apply]` | Creates a todo per task, writes the linked `@@T-…`, trims; a dry run by default |
| `plan init <plan>`            | Approves: tasks, GitHub issue, Slack channel, front matter                      |
| `plan sync <plan>`            | Re-reads memory, ticks, aligns titles and links, republishes the issue          |
| `plan sync --channel`         | Also re-applies the channel's topic, which leads with the issue link            |
| `plan status <plan>`          | Progress per area, the issue and channel links, the decisions it cites          |
| `plan adopt <plan> <id…>`     | Puts an existing todo, friction, decision or issue under the plan               |

`<plan>` is a file, a folder under `plans/`, or the folder name (`agent`). A dry run is what `tasks`
and `init` do until `--apply` says otherwise; `--dry-run` is honoured by `init` too.

## The lifecycle

1. **Draft with detail.** `plan check` must report zero problems before approval.
2. **Decide.** Every choice the implementation must not re-litigate is a `decision` entry, cited as
   `@@D-xxx` in the plan and in the code that embodies it.
3. **Approve.** `blong-dev plan init <slug> --repo feasibleone/blong --invite <slackUserId>`. It
   creates the tasks, trims the plan, creates or reuses the issue (label `plan`) and opens the
   private channel `plan-<slug>` whose purpose is the plan title and whose topic leads with the
   issue link — a topic Slack cuts off, and a link written after the title is a link nobody sees.
   The front matter records the issue, the conversation id and where the channel opens:

    ```yaml
    ---
    slug: agent
    title: blong-agent — implementation plan
    status: approved
    repo: feasibleone/blong
    issue: 247
    issueUrl: https://github.com/feasibleone/blong/issues/247
    platform: slack
    account: blong-bot
    channelName: plan-agent
    conversationId: C0ABCDEF
    channelUrl: https://slack.com/app_redirect?channel=C0ABCDEF
    created: 2026-11-11
    approved: 2026-11-11
    ---
    ```

    `channelUrl` is Slack's own deep link: the client or the browser opens the channel from its id
    alone, with no workspace id in the URL. `plan sync` fills it in on a plan approved before the
    key existed.

4. **Execute.** `memory show @@T-531`, do the work, `memory close @@T-531 --note "…"`. The close
   ticks the plan; the entry keeps the detail under `## Done`.
5. **Report.** `plan sync <slug>` after a batch republishes the issue body from the plan and the
   memory; `--comment` adds a progress comment instead of rewriting it, and `--channel` re-applies
   the channel's topic — the repair for a channel opened before its issue existed, or for a plan
   that was retitled.

## Decisions and frictions on the board

A task becomes a todo when the plan is approved, but a choice taken or a friction hit while the work
runs has nowhere to show. `memory add` with `--plan` puts it on the board:

```bash
blong-dev memory add decision --title "a plan task line links to its memory entry" \
    --area tools/blong-dev --body-file /tmp/d-links.md --plan plan-workflow
blong-dev memory add friction --title "the credential delete hit a foreign key" \
    --area realm/blong-access --body-file /tmp/f-order.md --plan plan-workflow
```

The entry is written as usual, and one line joins the plan's section:

```markdown
## Decisions and frictions

- [@@D-811](../../tools/blong-dev/.github/memory/decision.md#d-811--…) a plan task line links to its
  memory entry · active
- [@@F-713](../../realm/blong-access/.github/memory/friction.md#f-713--…) the credential delete hit
  a foreign key · resolved
```

The line is the same link a task carries, plus the status: a reader sees what was decided and
whether it still holds without opening the memory. The tool maintains it — `memory close` rewrites
the status as it closes the entry, and `plan sync` re-reads every line against the memory and
re-anchors a retitled entry. An id the memory no longer holds is reported and its line left in
place, so the board never silently loses the record of a decision. A todo is not listed here: it
belongs in the work breakdown, and `memory add todo --plan` refuses.

## Asking a question while the plan runs

The channel exists so a decision does not wait for the owner to be at a keyboard. `chat.prompt.ask`
posts the question and waits: the call resolves with the answer, or fails with `chat.promptTimeout`
when nobody answers (five minutes unless `timeoutMs` says otherwise). Every answer carries the
`sender`, and the field its control produced — `value` for one choice, `values` for several, `text`
for something typed.

A question may wait for days. `timeoutMs` goes up to `2147483647` ms — the `setTimeout` ceiling of
about twenty-five days, above which the value is refused as `chat.promptTimeoutTooLong` rather than
silently shortened — and the client holds its connection open meanwhile, so three days is a
reasonable horizon for an approve-or-not. What a long wait does not survive is a restart: the
pending question is a promise in the process that asked, so a redeploy, a hot-reload or a crash
loses it, and an answer that arrives afterwards is logged and dropped. That is accepted here — the
asker re-asks. Where an answer must survive anything, the agent's checkpoint is the shape:
`agent.question.ask` writes the pending checkpoint before it asks and takes its own timeout as a
_suspension_, so the answer resumes the session cold however long it takes.

The default is a **card in the message**: the question, its controls and a Submit. Nothing is asked
in a dialog unless the question is a form of several answers.

| Ask                                  | `kind`                        | The card holds                           | Comes back                 |
| ------------------------------------ | ----------------------------- | ---------------------------------------- | -------------------------- |
| Yes/no                               | `confirm`                     | Yes and No buttons, plain in the message | `{value: 'yes' \| 'no'}`   |
| One of a list                        | `choice`                      | radio buttons                            | `{value}`                  |
| Several of a list                    | `multiChoice`                 | checkboxes                               | `{values}`                 |
| One of a list, or something else     | `choice` + `placeholder`      | radio buttons and a text box             | `{value}` and/or `{text}`  |
| Several of a list, or something else | `multiChoice` + `placeholder` | checkboxes and a text box                | `{values}` and/or `{text}` |
| Anything typed                       | `text`                        | a text box                               | `{text}`                   |

`placeholder` is what adds the text box, and it labels it. A list longer than ten options is shown
as a dropdown instead of radios, because that is the most one control takes — it is Slack's limit,
not the card's, and the question stays in the message. Name a presentation only to override the
default: `inline` for a message with buttons and no typing at all, `form` for a dialog of several
questions rather than one answer.

A text question answered by `inline` depends on the platform posting the reply back, and a plan's
channel is private: Slack sends that message only to an app that holds `groups:history` _and_
subscribes to `message.groups`. The port writes the subscription itself, so this works where the app
was created by a workspace's configuration token; an app installed by hand may have neither, and
then the reply answers nothing and the ask waits out its timeout. The card needs no event at all,
which is why it is the default.

An empty Submit settles the question with `{promptId, sender}` and nothing else, because a message
enforces no required field. A caller that needs an answer reads it and asks again — and because a
typed reply answers the newest pending question in the conversation, one free-text question should
be in flight at a time.

```bash
# Yes/no — a confirmation, not a list of one option
blong-dev call chat.prompt.ask '{conversationId: C0ABCDEF, kind: confirm, text: "Close the plan and its tasks now?"}'

# One of a list, with an escape hatch
blong-dev call chat.prompt.ask '{
  conversationId: C0ABCDEF, kind: choice,
  text: "Which database should the next run write to?",
  placeholder: "Something else",
  options: [
    {value: local, label: "The local dev database"},
    {value: shared, label: "The shared integration database"}
  ],
  timeoutMs: 900000
}'

# Several of a list — the answer is `values`, and `value` is absent
blong-dev call chat.prompt.ask '{
  conversationId: C0ABCDEF, kind: multiChoice,
  text: "Which checks should run before the handover?",
  placeholder: "Anything else to run",
  options: [
    {value: unit, label: "Unit tests"},
    {value: lint, label: "Lint"},
    {value: verify, label: "Playwright verify"}
  ]
}'

# No list at all
blong-dev call chat.prompt.ask '{conversationId: C0ABCDEF, kind: text, text: "What should the realm be called?"}'
```

`platform` and `account` are omitted above because the plan's `.blong_callrc` supplies both under
`payload.chat`. `chat.prompt.find` shows what is still waiting, which is how a caller checks what it
asked without a transcript.

### Closing a plan

The last thing a plan asks is what happens after it. Send the summary as a message — it is a record,
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

`value` is the option's identity — a caller switches on it, so name it once and treat the label as
text that may be reworded. Keep labels short: a button truncates at 75 characters and a placeholder
at 150. One decision per question, because two questions in one message come back as one answer.
`echoAnswer` is on by default, so the answered message says who answered and what; turn it off for a
question whose answer nobody needs to reread.

## Adopting work that exists

- `plan adopt <slug> @@T-123` puts an existing task on the board; a done entry arrives ticked.
- `plan adopt <slug> @@F-045` lists a friction as adopted context, with no checkbox to tick.
- `plan adopt <slug> --issue <url>` links an issue a plan inherited instead of creating a second
  one.
- `plan init <slug> --issue <url>` does the same at approval.

Adopt rather than describe the same work twice: a duplicate is what makes `memory audit` unusable.

## Why the detail moves

The plan answers "how far is it", and the memory answers "what exactly is left". Keeping the detail
in the plan meant two records that drifted — a task edited in the plan was not the one the executing
agent read, and a closed entry did not move the board. The split gives each file one job: the plan
keeps titles and checkboxes, the memory keeps the reasoning, and the issue shows both to anyone who
is not on this machine.
