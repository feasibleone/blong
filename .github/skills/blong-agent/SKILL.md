---
name: blong-agent
description:
    Work the reusable `realm/blong-agent` — a ticket-running agent realm with a pluggable model
    engine. Covers the engine adapter (step and native modes, vercel/mastra/deepseek/sim accounts),
    ticket claim and lease, the workspace jail and command switch, the askHuman interruption and its
    cold resume, the worker tick, the answer row and the wake-up brokers. Use this skill whenever a
    task mentions an agent, a ticket, an engine account, a checkpoint, a suspended session, or
    resuming a model session — even if the words "realm" or "agent realm" are not used.
---

# blong-agent

`realm/blong-agent` claims one ticket at a time and lets a model work it in that ticket's own
workspace, asking a person when it cannot decide. Read `realm/blong-agent/README.md` first; this
skill is the map of where each idea lives and what to check before changing it.

## Where things are

| Concern                               | File                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| The one namespace and its settings    | `orchestrator/agentDispatch.ts` (plus the port's `start()`/`stop()` and the tick interval) |
| Claim, release                        | `orchestrator/ticket/agentTicketClaim.ts`, `agentTicketRelease.ts`                         |
| The loop, both modes                  | `orchestrator/session/agentSessionRun.ts`                                                  |
| Tool definitions, the tool boundary   | `orchestrator/tools.ts`, `orchestrator/session/agentToolRun.ts`                            |
| The question and the wait             | `orchestrator/session/agentQuestionAsk.ts`                                                 |
| Suspend, resume                       | `orchestrator/session/agentSessionSuspend.ts`, `agentSessionResume.ts`                     |
| Answers, wake                         | `orchestrator/answer/agentAnswerReceive.ts`, `agentAnswerWake.ts`                          |
| Recovery                              | `orchestrator/recovery/agentRecoveryScan.ts`                                               |
| One pass                              | `orchestrator/worker/agentWorkerTick.ts`                                                   |
| The engine instance and its accounts  | `adapter/engine.ts` (implementation in `core/blong-gogo/src/adapter/server/agent.ts`)      |
| The ticket pool                       | `adapter/task.ts` + `adapter/task/` (`task.pool.reset` is the fixture's own verb)          |
| The workspace root and command switch | `adapter/workspace.ts` + `core/blong-gogo/src/adapter/server/workspace*.ts`                |
| Persistence                           | `adapter/db/` — sessions, checkpoints, answers, events                                     |
| The gateway surface                   | `gateway/agent/*.ts` (authenticated by default; `auth: false` opts out)                    |

## Rules that are easy to get wrong

- **An orchestrator cannot inject its `db` handlers by bare name.** Prefix the adapter whose
  namespace differs from the method's: `handler: {'db/agentSessionAdd': agentSessionAdd}`. The
  prefix is only needed there — `taskNextClaim` and `workspaceRepoWrite` name their own adapter
  already. (`@@F-654`)
- **A JSON column may come back already parsed.** Read a transcript through `agentHistory` in
  `orchestrator/tools.ts`; `String(parsed)` is `[object Object]`. (`@@F-655`)
- **Two writers, one checkpoint sequence.** The question path writes a pending checkpoint while a
  step is parked, so the run takes the next sequence from the table, not from a counter in memory.
- **A resume lifts the suspension before it runs.** `agentSessionRun` refuses a suspended session it
  was not given an answer for, so `agentSessionResume` sets the row to `running` first.
- **The claim asks the engine account for its mode.** Defaulting to `step` silently runs a native
  account through the step loop.
- **A session belongs to a host.** Resume and wake compare `workerId` with `HOSTNAME`; a lookup by
  session should name the worker too. (`@@F-656`)
- **The pending checkpoint goes in before the question.** Writing it after the ask makes the
  interruption safe only while the asker survives.

## Running it

```bash
cd realm/blong-agent
blong ./index.ts upgrade                      # schema
blong ./index.ts dev                          # developer loop
CI=1 blong ./index.ts integration             # the groups; exits on its own because integration.exit is isCI()
```

The groups are `test.agent.ticket`, `test.agent.session`, `test.agent.workspace` and
`test.agent.recovery`, wired in `config.integration.watch.test`. The sim accounts (`local`,
`asking`, `slow`, `native`) make the whole loop runnable without a model key; `questionMethod`
points at `test.agent.question.echo` there, because a question with nowhere to go parks for the
whole timeout.
