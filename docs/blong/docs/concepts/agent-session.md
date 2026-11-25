---
sidebar_position: 3
---

# Agent session

An agent session is one ticket worked by one model, and its **feed** is what that work reported
while it happened: the model's thinking, the words it said between tool calls, every call it made
with the arguments and the result, and the states the session passed through. The feed is a Kafka
topic, so a reader can attach to a session that started an hour ago and still see it live.

The session page is the realm's own browser platform: a list of sessions, and one transcript whose
sections appear as they are published. Each kind is drawn as what it is — reasoning as thinking, a
shell call as its command, its output and its exit code, a file write or an edit as a diff with the
lines it added and removed, a question as a card with the choices it offered and the answer a person
gave — and a run of calls with nothing between them is one row rather than a wall of boxes.

Two things make it a contract rather than a screen: the page reads the feed and never reconstructs a
session from the database, and the same event shapes are what the projection folds for the list and
the header — so a settled session and a running one are one list read two ways.

- **To watch a real run:** see [watching an agent session](../patterns/agent-session.md).
- **Where the events come from:** see [the agent engine](../patterns/agent-engine.md).
