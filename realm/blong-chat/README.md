# blong-chat

Slack and Viber as a Blong realm: a message arrives at a webhook path, an answer comes back to the
call that asked for one, and a question can be a button, a checkbox list or a typed reply.

The point of it is `chat.prompt.ask` — a call that sends its controls and returns the answer, the
way an editor's question tool does, but for a person on a phone. That is what makes a chat interface
usable as an alternative to `vscode/askQuestions`: nothing at the caller's side has to poll.

```text
gateway  /rpc/chat/out/messageSend ─┐
                                    ├─▶ chat.out ─▶ slack | viber port ─▶ platform API
gateway  /rpc/chat/prompt/ask ──────┤                 ▲
                                    └─▶ chat.prompt  │
webhook  /chat/slack/{appId}/{clientId} ─▶ chat.in ──┘  (answer settles the ask)
webhook  /chat/viber/{appId}/{clientId} ─▶ chat.in
```

## The four methods

| Method                  | What it is for                                               |
| ----------------------- | ------------------------------------------------------------ |
| `chat.out.messageSend`  | Post text or a prompt to a conversation.                     |
| `chat.prompt.ask`       | Post a question and return the answer, or fail on a timeout. |
| `chat.prompt.find`      | What is waiting, for a caller that wants to see the state.   |
| `chat.in.answerReceive` | Answer from a program instead of a person.                   |

`chat.prompt.ask` takes `platform`, `account`, `conversationId`, `text`, `kind` and, per kind,
`options` or `placeholder`. The answer comes back as `{promptId, value}`, `{promptId, values}`,
`{promptId, text}` — or a mixture, because a person may pick and type the same answer.

The shapes an editor's question tool offers map onto them directly, and the default is to ask them
**in the conversation**: the options sit in the message with a submit under them, so a person never
leaves the channel to answer.

| What the caller wants          | `kind`        | Inline — the default                                        |
| ------------------------------ | ------------- | ----------------------------------------------------------- |
| One of several (radio buttons) | `choice`      | Radio buttons and a submit; Viber keyboard buttons          |
| Several of many (check boxes)  | `multiChoice` | Checkboxes and a submit                                     |
| A free-text answer             | `text`        | "Reply here with your answer"; the next reply in the thread |
| Yes or no                      | `confirm`     | Two buttons                                                 |

Slack has no text field in a message, so a question that also accepts something typed says so —
`or reply here: v1.2.0-rc.1` — and a pending question claims the next reply in that conversation.
The same is true on Viber, where a keyboard cannot hold an input at all but a typed reply is
natural.

`presentation: 'form'` asks for the platform's own dialog instead, which is the only place Slack
puts a text box beside the options:

| What the caller wants             | `kind`                        | With `presentation: 'form'`                                        |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| One of several, or type something | `choice` + `placeholder`      | A modal with a radio group **and** a text box — either one answers |
| Several, or type something        | `multiChoice` + `placeholder` | The same modal with a text box beside the checkboxes               |
| A free-text answer                | `text`                        | A modal with one text box                                          |

`placeholder` is still the whole trick: it is the caller saying "or type something else", which is
what makes a question a superset of a multiple-choice list. Ask for a form when the question needs
the pair in one place; ask inline (the default) when the answer belongs in the conversation.

An answered question is rewritten into its own message: the options stay, the ones that were picked
are marked — `✅ Unit tests`, `✅ Lint`, `• Integration` — every control goes, because a control
that no longer answers anything is a trap (`@@D-692`), and the line under them says **who**
answered: `🗨️ @someone answered` (`@@D-693`). A Slack mention renders as that person's avatar and
name, so the message reads as a conversation rather than as a form result; something typed is still
named, because no mark can carry it. It is written **before** the ask returns, so a caller holding
an answer already knows the channel shows it. On Viber, where a message has no blocks to mark and no
mentions to render, the same edit writes `— Someone answered: …` and drops the keyboard. When the
platform did not report which message it posted, or the edit is refused, the answer is posted as a
separate message instead — and either way a failed edit is a warning that never costs the answer
(`@@D-690`). `echoAnswer: false` on one question leaves the message as it was; the setting is per
question, because a survey and an approval question are often asked in the same conversation.

```bash
curl -s -X POST http://localhost:8080/rpc/chat/prompt/ask -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"chat.prompt.ask","params":{"platform":"slack",
       "account":"demo","conversationId":"D1","text":"Which checks should run?",
       "kind":"multiChoice","placeholder":"Anything else to run",
       "options":[{"value":"unit","label":"Unit tests"},{"value":"lint","label":"Lint"}],
       "echoAnswer":false,"timeoutMs":120000},"id":1}'
```

Add `"presentation":"form"` to that call and the same question arrives as one button that opens a
modal with the checkboxes and a text box in it.

`params` is the object the method's schema declares. Positional params — `"params": [{…}]` — belong
to the internal RPC server on 8091, where a handler's arguments are a list with `$meta` last; the
public gateway hands one params value to one handler.

A question that nobody answers fails as `chat.promptTimeout` — the alternative is a request that
holds a connection until the process restarts. A control the platform cannot render is refused with
`chat.platformUnsupported` instead of being silently degraded into a different question: Viber has
keyboards, not forms, so a `multiChoice` there is an error and not an approximation.

A form is a modal, and a modal is opened for one person and dismissed by the answer they submit. The
port answers every interaction with the JSON Slack's own client reads — an empty object for a click,
`{"response_action": "clear"}` for a submission — because Slack keeps a submitted view on screen,
under a "We had some trouble connecting" line, when the 200 carries any other body (`@@F-645`). The
Events API delivery on the same path still gets `EVENT_RECEIVED`; which one a request is comes from
its body, not from its address.

## Create the Slack app

1. <https://api.slack.com/apps> → **Create New App → From scratch**, pick the workspace.
2. **OAuth & Permissions → Scopes → Bot Token Scopes**: `chat:write` to post, `files:read` to read
   what a person attaches. Nothing else is needed; the realm subscribes to nothing it does not read.
3. **Install to Workspace**, then copy the **Bot User OAuth Token** (`xoxb-…`) and, from **Basic
   Information → App Credentials**, the **Signing Secret**. The **App ID** and **Client ID** on the
   same page are the two segments of the webhook path.
4. **Event Subscriptions → Enable Events**, Request URL
   `https://<host>/chat/slack/<appId>/<clientId>`, and subscribe to the bot event
   **`message.channels`** (and `message.im` for direct messages). Slack sends a `url_verification`
   challenge when the URL is saved; the realm answers it from the server hook, so the URL is
   accepted as soon as the process is up and the signing secret matches.
5. **Interactivity & Shortcuts → Interactivity → Request URL**: the same URL. Buttons and modal
   submissions arrive there as `payload=<json>`, and sharing one path is why the path has no verb in
   it — the body says what it is.
6. Put the values in the realm's `.blong_devrc` (see `blong_devrc.example` in this folder). Adding a
   `configToken` lets the port rewrite steps 4 and 5 by itself on every start, and it finds the
   address without being told:

```yaml
chat:
    slack:
        accounts:
            demo:
                appId: A1
                clientId: T1
                botToken: xoxb-your-bot-token
                signingSecret: your-signing-secret
                configToken: xoxe-1-your-app-configuration-token
```

## The tunnel configures itself

An ngrok hostname is the thing that changes most often in a local chat setup, and the two addresses
Slack posts to are app settings. So the port works both out on every start, without being told
either:

1. **Ask the agent.** `ngrok` runs a status API (`http://127.0.0.1:4040/api/tunnels`) that lists the
   tunnels it is forwarding and the local address each one points at. The port takes the tunnel
   whose `config.addr` names _its own_ listening port — 8095 for Slack, 8096 for Viber — preferring
   `https`. A machine running two tunnels therefore publishes both listeners correctly, and a tunnel
   for another port is ignored.
2. **Rewrite the app.** For every account with a `configToken`, it probes the tunnel, exports the
   manifest with `apps.manifest.export`, writes the request URL into
   `settings.interactivity.request_url` and `settings.event_subscriptions.request_url`, and sends it
   back with `apps.manifest.update`. The URL is the port's own path with that account's ids —
   `https://<host>/chat/slack/<appId>/<clientId>` — one address for Events and Interactivity.
3. **Register the bot.** Viber needs no manifest: the port appends its path to the same discovered
   address and calls `set_webhook`.

A configuration token starts with `xoxe-1-` and comes from **Your Apps → App Config Tokens** — it is
the only thing the manifest step needs from you. Everything else is a warning and never a throw: a
process started before the app exists, or before the tunnel is up, still serves what it can, and the
next restart retries. The event subscriptions themselves are left exactly as they are — this
re-points the app, it does not decide what it listens to.

Naming an address is still possible, for an agent on another port or a fixed hostname:
`chat.slack.ngrokAgentUrl` (default `http://127.0.0.1:4040/api/tunnels`) or, per account,
`ngrokUrl`. An account that names its own `url` — a simulator, a proxy — is never repointed.

## One port, several accounts

An account is not only a token. It carries where its calls go and where its messages are delivered
to:

| Setting       | What it decides                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ |
| `url`         | The API base this account posts to. Unset means the port's own (`https://slack.com/api/`). |
| `configToken` | Slack app configuration token; with it, the app's request URLs follow the tunnel.          |
| `ngrokUrl`    | Optional public base, for an agent elsewhere or a fixed hostname; default is discovered.   |
| `webhookUrl`  | Viber's registration address outright, when the tunnel is not how it is reached.           |

`chat.slack.ngrokAgentUrl` / `chat.viber.ngrokAgentUrl` name the agent's status API when it is not
on the default port (a second `ngrok` process uses 4041).

That is what lets one process serve a real workspace and a simulator at once: the test accounts
point `url` at `http://127.0.0.1:18085/api/`, the real one at Slack, and nothing else changes. It is
also why the listener's port is the same in both cases — the port is one adapter, and the account
decides where the conversation happens.

Who receives a message is per account too:

```yaml
chat:
    chatDispatch:
        forward:
            demo: myRealm.myHandler.receive
            '*': chat.in.message.ignore
```

## Create the Viber bot

1. Create a bot in the [Viber Admin Panel](https://partners.viber.com/) and copy its
   **Authentication Token**.
2. The **App ID** is in the bot's public URL (`viber://pa?chatURI=<uri>` uses the URI; the pair the
   path is built from is the id the panel shows and the client id of the bot account).
3. Nothing to enter by hand: the port asks the ngrok agent which tunnel forwards its own port,
   appends its path to it and registers the result with `set_webhook` on every start — so a changed
   hostname is a restart rather than a dashboard visit.

```yaml
chat:
    viber:
        accounts:
            demo:
                appId: pa1
                clientId: C1
                authToken: your-viber-auth-token
```

## Run it locally

Slack and Viber both have to reach the listener from the internet, so a laptop needs a tunnel:

```bash
cp blong_devrc.example .blong_devrc    # then fill in the tokens
ngrok http 8095 --domain=<slack-subdomain>.ngrok.app
ngrok http 8096 --domain=<viber-subdomain>.ngrok.app
blong ./index.ts
```

The realm listens on **8095** for Slack and **8096** for Viber, and answers the gateway on **8080**.
A new ngrok hostname is a restart: the port re-points the Slack app and re-registers the Viber
webhook by itself (see above).

`.blong_devrc` and `chat.http` in this folder are the manual-play pair: the rc file configures the
accounts and the http file has one request per method, including the challenge and a signed message,
with a note on where the signature comes from.

## What a deployment looks like

The realm owns no page, so a deployment publishes no portal. Its addresses are the webhook paths,
and `adapter/slack.ts` and `adapter/viber.ts` declare them as a port and an ingress in
`activation.default`:

```ts
k8sPorts: {chatSlack: {port: 8095}},
k8sIngresses: {chatSlack: {path: '/chat/slack', servicePort: 8095}},
```

`@feasibleone/blong-kustomize` turns that into an Ingress on the deployment's own host and a Service
that carries the port, so the address a platform posts to is a DNS record and a certificate on the
deployment, not a number in this source tree. The host is named in the rc file used for the `k8s`
intent (`chat.slack.k8sIngresses.chatSlack.host`, and the Viber entry beside it).

## Who receives a message

The realm is a bridge and has no business logic, so a message from a person goes to the method the
account's `chat.chatDispatch.forward` entry names. An account nobody maps falls to `*`, which the
port's activation sets to `chat.in.message.ignore` — it logs the drop and acknowledges the platform,
so a standalone deployment answers Slack and shows an operator what arrived.

A typed reply is different from a message: while a question is pending in that conversation, the
reply answers it and never reaches the consumer, because a free-text answer carries no prompt id for
the platform to send back.

## Tests

`server/test/test/testChatInbound.ts` and `testChatOutbound.ts` run against two simulator ports
(`sim/slackSim.ts`, `sim/viberSim.ts`) instead of the real APIs, and post signed bodies to the
listener the realm opened. `blong-dev test` in this folder runs them:

```bash
cd realm/blong-chat && blong-dev test
```

The suite wants the same ports a running `blong` process holds — the listener, the gateway and the
two simulators — so `CHAT_TEST_PORT=28095` moves the whole set (listener, simulators and the test
accounts that call them) out of the way:

```bash
CHAT_TEST_PORT=28095 blong-dev test
```
