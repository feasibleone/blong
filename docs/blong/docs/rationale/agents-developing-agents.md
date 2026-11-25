---
sidebar_position: 4
---

# Agents developing agents

The agent realm was built to do one thing that could not be proved any other way: give a coding
agent a ticket in this repository, let a model work it on a machine of its own, and watch the work
happen from a browser on another machine. It ran. A copilot runtime on a box in the next room
claimed a ticket, wrote files in a jailed workspace, asked a person a question and resumed with the
answer, and the page drew each step while it was still happening.

This page records why the parts are shaped the way they are. The contract between the publisher and
the page is in [watching an agent session](../patterns/agent-session.md), the process itself is in
[the agent engine](../patterns/agent-engine.md), and the story of the first real run is the blog
post [agents developing agents](/blog/agents-developing-agents).

<ArchifyDiagram slug="agents-workflow" title="Agents developing agents — one ticket, one runtime,
one transcript" height="760px"
posterLight={require('./img/diagrams/agents-workflow-light.png').default}
posterDark={require('./img/diagrams/agents-workflow-dark.png').default} />

## The problem: a transcript is the product

An agent that edits code is easy to run and hard to trust. A terminal session tells you what it said
and nothing about what it cost, which tool failed, or whether the file it claims to have written
exists. The alternative most tools reach for is a client that keeps the conversation in memory: fine
for one person in one browser tab, useless for a ticket that outlives a page reload, a restart or
the person watching it.

The realm takes the other branch. **Every turn is published before anybody reads it**, to a topic
that keeps it, so a session is a fact about the system rather than a view of a client's state. Three
consequences follow, and each of them decided a piece of the design.

**A session must be readable after the fact.** A run that started an hour ago replays because the
topic retains it; the page attaches at a cursor (`partition:offset`) and continues into the live
feed without a gap or a repeat. Nothing reconstructs a session from a database, so there is no
second version of the truth to drift.

**A running session must be readable while it runs.** The feed is a stream route, not a poll: the
handler answers an async iterable, every frame is sealed with the caller's key, a keepalive frame
distinguishes a quiet session from a dead connection, and a frame is capped at one mebibyte so a
reader never trusts a length it cannot honour. Server-sent events and a binary envelope carry the
same frames, because a person debugging a stream with `curl` and a browser reading a megabyte of
deltas have different needs and neither should dictate the other.

**The work must happen somewhere it can be bounded.** The runtime that owns the model loop runs on
another host, in a directory the ticket may touch, with its own token. The realm keeps what the
runtime cannot answer — a question for a person, the statement that the session is finished — and
the runtime calls back into it for those. That boundary is why a deployment can switch shell access
off and mean it: a session offered no shell tool cannot run a command, whatever the model decides.

## What it costs

Three things are more expensive than they look, and they are the honest price of the shape.

_The feed is a second write._ A run that reports telemetry publishes a batch every 75 milliseconds
and folds the same batch into a projection, so the list and the header never replay a topic. The
projection can lag the feed; the page says which source answered a number rather than pretending
they agree.

_A question is a suspension._ Asking a person parks the run, writes the question, the tool call and
the history into a checkpoint, and waits for an answer that arrives as a row and a wake. The resume
must find the same runtime session and the same pending call, which is why the tool call's id
travels through the dispatch and why the runtime session id is kept on the session row.

_Observation has to be a vocabulary._ Two engine kinds report the same work in different payloads:
one streams deltas, another hands over whole messages; one puts an exit code in `shellExecution`,
another at the top level of its result. The realm publishes one vocabulary and the page reads one
shape, and the alternative — a page per engine — was rejected as a second implementation of every
card.

## The loop that proved it

The claim above is only worth what the loop behind it is worth, so the loop is part of the design. A
task file is the prompt for every run; `scripts/runTask.sh` claims the first free ticket, checks
that the account answers before it claims anything, and runs in the foreground so a person can
watch; the realm serves both the run and the page; and the two runtimes on the LAN take turns, one
account per host. The third agent in that picture is the one in the editor — it writes the task,
restarts the backend, reads the rows and the pictures — and all three reach the same model with a
token of their own, which is what keeps a bill and a rate limit separable per agent.

<ArchifyDiagram slug="agents-test-loop" title="How the loop was tested — three agents, one script,
one page" height="820px" posterLight={require('./img/diagrams/agents-test-loop-light.png').default}
posterDark={require('./img/diagrams/agents-test-loop-dark.png').default} />

What makes the run evidence rather than a claim is where the facts land: the partition on the
session row is a broker delivery report, the transcript replays after a reload because the topic
kept it, and the browser spec drives its own ports and compares both palettes, so a rendering defect
fails a run instead of a review.

## What it bought

A test that could not be written any other way: a real model, in a real workspace, on a real
network, with the result visible in a browser while it happened. The tour task takes about two
minutes, and what the page shows at the end is not a claim about the session but the session:
fifteen tool calls with their commands, their exit codes and their outputs, the diff of the file
that was edited, the question that was asked and the answer a person gave, and the token count the
model actually cost.
