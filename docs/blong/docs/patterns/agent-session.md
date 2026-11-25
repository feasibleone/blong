# Agent session

How to watch an agent session: what the feed carries, how a reader attaches to it, and what the page
draws from it. The [concept](../concepts/agent-session.md) says what the page is for; this page is
the contract between the realm that publishes and the page that reads.

## Run a session against a real runtime

A runtime host is one account per host, and the realm's own script claims the first free ticket,
writes the task as the session's prompt and runs it in the foreground:

```bash
cd realm/blong-agent
./scripts/runTask.sh nuc --task scripts/tasks/ui-tour.md
```

```text
runTask: account nuc, worker ms-02
runTask: claimed T-1002 "Add a regression test for ticket claims", session 972061da-… in native mode
runTask: watch it in the portal — Agent → Sessions → the newest row
runTask: status done
```

The backend must be up first. The intents decide where telemetry goes:

```bash
node --run blong-watch -- microservice integration dev \
    --config /path/to/.blong_devrc --gateway.port=8080 --resolution.portGateway=8080
```

`playwright` in that list switches the feed to the in-memory ring for a browser test; leave it out
and the feed goes to Kafka, which is what a run somebody watches should use.

| Setting                                 | Default           | What it decides                                                       |
| --------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `agent.agentDispatch.telemetry.source`  | `kafka`           | `kafka` publishes to the broker; `memory` keeps a ring in the process |
| `agent.agentDispatch.questionMethod`    | `chat.prompt.ask` | where `askHuman` asks; a test points it at an echo                    |
| `agent.agentDispatch.questionTimeoutMs` | 30 minutes        | how long a parked question waits                                      |

An account's own `timeoutMs` is the model's budget and belongs in the rc file beside its address.
The copilot SDK waits 60 seconds for `session.idle` unless it is told otherwise, which a task that
sleeps between steps outruns.

## The feed

One Kafka topic, `blong.agent.telemetry`, namespaced by the realm that owns it. A record is one
event, keyed by the session id so a session's events share a partition and keep their order. The
**first** batch of a session waits for its delivery report, because the report is where a partition
becomes a fact; later batches are produced without waiting and the key keeps them together.

A deployment with no broker sets `source: memory`, which is the same contract read from a ring in
the process — the page cannot tell the two apart.

### Reading it

`agent.session.watch` is a stream route, so its handler answers an async iterable and every frame is
sealed like any other reply.

| Parameter   | Meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `sessionId` | the session to read                                     |
| `tail`      | how many partition messages to replay before going live |
| `after`     | resume from a cursor, as `<partition>:<offset>`         |
| `details`   | send `{partition, offset, size}` and no events          |

A frame carries `events` and `last`, the cursor for the next `after`. A frame is capped at 1 MiB and
the writer and reader both enforce the cap; a keepalive frame travels in the binary envelope so a
quiet session is not mistaken for a dead connection.

### Events

| `kind`             | Payload                                                                          | The page draws                                  |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `reasoning`        | `{text}`                                                                         | thinking, collapsed unless it is the newest     |
| `message` / `text` | `{text}`                                                                         | the assistant's words, as markdown              |
| `tool`             | `{toolCallId, toolName, arguments}`                                              | a call, inside the run it belongs to            |
| `tool-result`      | `{toolCallId, toolName, durationMs, success, shellExecution, result, fileEdits}` | the call's answer                               |
| `status`           | `{state, text?, usage?}`                                                         | a state; `finished` carrying text is the answer |
| `step`             | `{text, finishReason}`                                                           | the realm's own record of a turn                |
| `answer`           | `{promptId, text}`                                                               | the answer a person gave a parked question      |

A text kind appends to the open section of its kind, a tool call opens a card that its result
closes, and anything the page does not model is still shown as a note rather than dropped. `running`
and `done` are the status bar's business and are not rows; a state a person must act on (`awaiting`,
`failed`, `suspended`, `aborted`, `blocked`) keeps its row even when it says nothing else.

The engine reports its last assistant message as a `message` and not a second time on the `finished`
state — one answer is one message. A kind that reports no message keeps its text on the state.

## What a call carries

A tool section keeps `detail`, read from the payloads rather than printed as JSON, because the two
engines name the same work differently:

| Field                 | Comes from                                                          | Shown as                                      |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `command`             | a shell's `arguments.command`                                       | the highlighted command                       |
| `exitCode`, `success` | `shellExecution.exitCode`, `success`                                | a green `✓ 0` or a red exit pill              |
| `output`              | `result.content`, minus the runtime's `<shellId: …>` trailer        | the output block                              |
| `path`                | `arguments.path`, or a result's `fileEdits[0].path`                 | the row's summary, shortened to the workspace |
| `content`             | a write's `file_text`, or a read's `result.content`                 | the file, opened                              |
| `diff`                | `result.detailedContent` when it is a unified diff                  | a coloured diff, and `+n −m` on the row       |
| `oldText`, `newText`  | an edit's `old_str` / `new_str`                                     | the two sides, when no diff came back         |
| `question`, `options` | `askHuman`'s arguments                                              | a card with its choices                       |
| `answer`              | a result's `answerText`, or that answer wrapped in `result.content` | what the person said                          |

A read answers with the file as `content` and a diff-shaped snapshot in `detailedContent`, so a read
is sized by its text and not by that snapshot. A custom tool's object comes back as a stringified
JSON document, which is why the answer is parsed out of the content.

## What a row does not show

A transcript is mostly quick, successful calls, so the page spends its marks only where a reader
needs them.

| Case                              | Drawn as                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------- |
| A command that exited 0           | a bare `✓`, with no pill and no number                                           |
| A command that failed             | a pill with `✗ 1`, because it is the row a reader has to find                    |
| A call under a second             | no time at all                                                                   |
| A call over a second              | seconds (`15.0s`), minutes past the minute (`2m 0s`)                             |
| A call or run over thirty seconds | the same time, marked in the warning colour                                      |
| A folded section                  | no caret until the pointer is over it; the caret stays while the section is open |
| Thinking                          | an icon over italic muted prose, with no title and no surface of its own         |
| A shell with no output            | the command alone, never the runtime's JSON envelope                             |

A lone call is the same card a run holds — the same badges, the same body — with one row inside it.

## Rows and the header

Sections reduce to rows: a run of two or more consecutive tool calls is one row whose header says
`Used 3 tools · bash ×2, edit`, and a lone call stays its own card. A message or a piece of
reasoning between two calls ends the run, so the grouping shows the shape of the turn rather than a
single wall.

The header starts from the projection the row carries and recomputes the cells from the events in
hand, saying which source answered. `turns` counts the opening state of a call, `tools` and
`tool time` come from the result events, and `tokens` and `context` come from the usage the engine
reports on a finished state. A cell the engine never answered shows `—`, which is a different fact
from a run that cost nothing.

## Migrating the view

`sessionMessages.ts` maps rows onto the `user | assistant | reasoning | activity` shape a chat
component such as CopilotKit's `CopilotChatMessageView` takes, with a run of calls as one assistant
message carrying them. It exists so a migration is a dependency swap: pinning the seam before
adopting the component is what tells you whether the shape holds.
