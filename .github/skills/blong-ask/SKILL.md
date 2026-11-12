---
name: blong-ask
description:
    Ask a human a question from inside a coding session and wait for the answer — in the plan's Slack
    channel or in `#blong-ask` — while the work runs. Covers when to ask in the channel instead of
    the editor's question tool, which conversation to ask in, the card surfaces a question can take
    (choice, multiChoice, confirm, free text), the timeout and its ceiling, and what a restart costs.
    Use this skill whenever a decision needs a person who is not at the keyboard, whenever
    `vscode_askQuestions` answers that the user is away, or whenever the task says to ask in chat —
    even if the words "Slack" or "prompt" are not used.
---

# Blong ask — a question a person answers in chat

A question asked in chat is a blocking call that a person answers minutes or days later. Two things
follow from that, and they are the whole of this skill: **choose the conversation the work belongs
to**, and **ask in a shape a message can hold** (@@D-823).

## When to ask in the channel

The editor's question tool is the first choice — it is faster and needs no connection. Ask in the
channel when:

- `vscode_askQuestions` reports that the user is away or cannot answer (a free-text answer saying so
  is a real condition, not a refusal: the person is telling you to use another channel);
- the user, a plan or a task explicitly says to ask in chat.

Never treat "the user is away" as permission to decide alone on something the ask was for. The
answer arrives in the channel, and the work resumes when it does (@@D-820).

## Which channel

The conversation follows the work:

- **A plan is active** — ask in that plan's channel. `plans/<slug>/plan.md` carries it in the front
  matter: `platform`, `account`, `conversationId`, `channelUrl`. A plan whose `status` is `approved`
  is active; the newest one is the one being executed.
- **No plan is active** — ask in **`#blong-ask`**, the channel kept for ad-hoc work. Its id lives in
  `.blong_callrc` as the default conversation (`payload.chat.conversationId`); where that key is
  missing, create the channel once and record the id it answers:

    ```bash
    blong-dev call chat.channel.create '{
      platform: slack, channelName: blong-ask, title: "Ad-hoc questions",
      isPrivate: true, invite: ["<slackUserId>"]
    }'
    ```

Never ask in another plan's channel because it is the one you have an id for — a question in the
wrong conversation is a question the owner may never read.

## The call

Run it from a folder that carries a `.blong_callrc` (`realm/blong-chat/` is the one in this
repository); it supplies `platform`, `account` and the server, so the call names only the
conversation and the question:

```bash
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
```

`chat.out.messageSend` posts a message that needs no answer; `chat.prompt.find` lists what is still
waiting, which is how a caller checks what it asked without a transcript.

## What comes back

The call resolves with the answer: `promptId`, the `sender` (`{id, name}`) and the field its control
produced — `value` for one choice, `values` for several, `text` for something typed. It fails with
`chat.promptTimeout` when nobody answers, which reads as "nobody answered", never as "refused": a
refusal is a typed error naming the control the platform cannot render.

## The surfaces

The default is a **card in the message**: the question, its controls and a Submit, where the question
was asked (@@D-817 @@D-818).

| Ask                                  | `kind`                        | The card holds                           | Comes back                 |
| ------------------------------------ | ----------------------------- | ---------------------------------------- | -------------------------- |
| Yes/no                               | `confirm`                     | Yes and No buttons, plain in the message | `{value: 'yes' \| 'no'}`   |
| One of a list                        | `choice`                      | radio buttons                            | `{value}`                  |
| Several of a list                    | `multiChoice`                 | checkboxes                               | `{values}`                 |
| One of a list, or something else     | `choice` + `placeholder`      | radio buttons and a text box             | `{value}` and/or `{text}`  |
| Several of a list, or something else | `multiChoice` + `placeholder` | checkboxes and a text box                | `{values}` and/or `{text}` |
| Anything typed                       | `text`                        | a text box                               | `{text}`                   |

`placeholder` is what adds the text box, and it labels it. Name a presentation only to override the
default: `inline` for a message with buttons and no typing at all, `form` for a dialog of several
questions rather than one answer.

Four rules keep the answer usable. `value` is what code switches on, so name it once and never
reword it (the label may change). Keep labels short — a button truncates at 75 characters and a
placeholder at 150. Ask one decision per question, because two questions in one message arrive as
one answer. And read the answer's field before using it: an empty Submit settles the question with
`{promptId, sender}` and nothing else, because a message enforces no required field.

## Limits that cost a round trip

- **Ten options per control.** A longer list is shown as a dropdown, which the realm chooses on its
  own (@@F-718 @@D-819). A label longer than 75 characters is truncated by the platform.
- **The wait has a ceiling of `2147483647` ms** — about twenty-five days, where `setTimeout`
  saturates. Above it the ask is refused with `chat.promptTimeoutTooLong` rather than reporting a
  closure that already happened. Three days (`259200000`) is a reasonable horizon for an
  approve-or-not (@@D-822).
- **A restart loses the question.** The wait is a promise in the process that asked, so a redeploy,
  a reload or a crash drops it and an answer that arrives afterwards is logged and dropped. For an
  answer that must survive anything, use the agent's checkpoint (`agent.question.ask`), which
  suspends a session instead of failing it — so it resumes cold however long the answer takes.
- **A private channel needs two settings** to deliver a typed reply: the app must hold
  `groups:history` and subscribe to `message.groups`. The port writes the subscription itself where
  a workspace's configuration token is present (@@D-821); an app installed by hand may have
  neither, and then a `text` question asked with `presentation: inline` waits out its timeout. The
  card needs no event at all, which is why it is the default.

## Before you ask

- The conversation is the work's own — the plan's channel, else `#blong-ask`.
- The question is one decision, with the `value`s named once.
- Something typed is asked as the card, unless there is a reason for `inline`.
- After the answer: record a durable choice as a decision (`blong-dev memory add decision --plan
  <slug>` where a plan exists), and carry on with the work.
