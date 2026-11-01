# blong-agent

A realm that runs one ticket at a time: a worker claims it from a pool, an engine (a model, or a
script) works in the ticket's own workspace, and a human is asked when a decision cannot be
inferred. The session survives the question — the workspace, the transcript and the prompt id are on
disk — so an answer that arrives twenty minutes later, or on another host, still continues the same
work.

## The lifecycle

```text
todo ──claim──► claimed ──run──► running ──┬──► done       (the model stopped, or called `finish`)
                                            ├──► failed     (the step limit, or a refused tool)
                                            └──► suspended  (a question nobody answered)
                                                    │
                                        answer ─────┴──► running  (resume from the checkpoint)
```

- **Claim** takes a free ticket through the task adapter, prepares the workspace and opens a
  session. A ticket that names a workspace of its own is refused and handed back when that workspace
  is not the one this host prepared.
- **Run** drives the loop in the mode the account reports. Every step's calls run through one tool
  boundary, and a checkpoint follows every step.
- **Suspend** happens when `askHuman` goes unanswered for `questionTimeoutMs`. The pending
  checkpoint is written _before_ the question, which is what makes the wait cold-safe.
- **Resume** replays the transcript (step mode) or names the engine's own session (native mode),
  folding the answer in as the result of the call that was parked.
- **Recover** asks a person, per suspended session this host left behind, whether to resume it,
  purge its workspace, or leave it.

## Engines

`adapter/engine.ts` is one instance of `adapter.agent`, and a second instance is another file with
its own namespace. Each account names a `kind` (`vercel`, `mastra`, `deepseek`, `sim`) and a `mode`:

| mode     | who owns the loop | what the realm does                                                                    |
| -------- | ----------------- | -------------------------------------------------------------------------------------- |
| `step`   | the realm         | one model turn, run the calls it asked for, checkpoint, again                          |
| `native` | the engine        | hand over the prompt and the tools, record the events it reports, store its session id |

The `sim` kind replays a script, so the whole loop runs without a key or a network — that is what
the tests use, and what a deployment without a model credential still answers with. A local model
needs no extra package: `ollama` is an intent in `adapter/engine.ts`, and it adds a `qwen` account
of kind `vercel` pointed at an Ollama host's OpenAI-compatible endpoint. `testAgentModel` sends it
one short turn, so the suite proves a real model where one is reachable and says nothing where it is
not.

```bash
CI=1 blong ./index.ts integration ollama
```

### One account, any endpoint

`kind` says who drives the loop; `provider` says what the model answers in, and it is the only thing
a new vendor costs. Most services publish the OpenAI chat-completions shape as their compatible
endpoint, so `openai` — the default — is the whole of OpenAI, Azure, Ollama, vLLM, LM Studio,
OpenRouter, Groq, Together, Mistral, DeepSeek, xAI, Gemini's compatibility base and Anthropic's. The
native ones are `anthropic` and `gateway`, and both ship with the framework — `@ai-sdk/anthropic`
and `@ai-sdk/gateway` beside `ai` — so naming one needs nothing installed. An image that prunes them
fails the one account that names it and nothing else, the rule an engine kind already follows.

The rc file is YAML and is addressed the way every component is — `<realm>.<instance>.<key>` — so
an account is `agent.engine.accounts.<alias>` under the suite root:

```yaml
agent:
    engine:
        accounts:
            # OpenAI itself.
            gpt:
                kind: vercel
                provider: openai
                modelName: gpt-4.1-mini
                apiKeyEnv: AGENT_ENGINE_API_KEY
                reasoningEffort: low
            # A laptop, no key worth naming.
            qwen:
                kind: vercel
                modelName: 'qwen2.5-coder:14b'
                baseUrl: http://localhost:11434/v1
                apiKey: ollama
            # A router in front of many vendors — one key, one URL.
            router:
                kind: vercel
                modelName: anthropic/claude-sonnet-4-5
                baseUrl: https://openrouter.ai/api/v1
                apiKeyEnv: OPENROUTER_KEY
            # Azure: the deployment name is the model, and the shape is still OpenAI's.
            azure:
                kind: vercel
                modelName: gpt-4o
                baseUrl: https://my-resource.openai.azure.com/openai/deployments/gpt-4o
                headers:
                    api-key: …
                    api-version: '2024-10-21'
            # Anthropic natively, which is what thinking budgets and caching want.
            claude:
                kind: vercel
                provider: anthropic
                modelName: claude-sonnet-4-5
                apiKeyEnv: ANTHROPIC_API_KEY
                reasoningEffort: medium
            # The harness: its own runtime, its own model string.
            dsh:
                kind: deepseek
                mode: native
                modelName: deepseek-v4-flash
                apiKeyEnv: AGENT_ENGINE_API_KEY
                dshHome: /home/node/.dsh
```

**The file name follows the last intent**, which is the one thing about rc files that bites: a bare
`dev` run reads `.blong_devrc`, while `integration ollama` reads the file named after that intent
instead — the stem is the intent, the extension `rc`. An address that seems to have no effect is
usually in the shared file while the run is looking at another one; `BLONG_ENV` names the suffix
directly, and a `--agent.engine.accounts.<alias>.<key>=` argument always wins over both.

A parameter the shortcuts do not cover goes in `parameters`, which is merged into the call last —
`topP`, `seed`, `stopSequences`, `frequencyPenalty`, and `providerOptions` for anything
vendor-specific. It wins over the shortcut it overlaps, so a `reasoning` written here beats
`reasoningEffort`:

```yaml
parameters:
    topP: 0.9
    seed: 7
    providerOptions:
        openai:
            reasoningEffort: high
```

`reasoningEffort` reaches the SDK as its own `reasoning` setting, which translates per provider —
OpenAI-style effort, Anthropic's thinking budget — rather than a flag one vendor understands and the
rest ignore.

## Configuration

| key                                                    | meaning                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `agent.agentDispatch.questionMethod`                   | the method a question is asked through (`chat.prompt.ask`)         |
| `agent.agentDispatch.engineAdapter` / `engineAccount`  | the account a claim opens a session with                           |
| `agent.agentDispatch.tickMs`                           | one pass of the worker                                             |
| `agent.agentDispatch.leaseMs` / `heartbeatMs`          | how long a claim holds, and how often it is renewed                |
| `agent.agentDispatch.questionTimeoutMs`                | how long a question waits before the session suspends              |
| `agent.agentDispatch.maxSteps` / `maxToolCalls`        | the only bound on a runaway loop                                   |
| `agent.agentDispatch.workerStart`                      | whether the port starts the tick itself (a test drives it by hand) |
| `engine.<instance>.accounts`                           | the accounts, their kinds and modes                                |
| `workspace.root`                                       | where a ticket's files live                                        |
| `workspace.shell.enabled`                              | whether `runCommand` may run at all                                |
| `workspace.shell.timeoutMs` / `maxOutputBytes` / `env` | the command's own bound                                            |

## What a deployment must give it

The realm contributes what it can from its own layer files, so a tree generated by
`blong ./index.ts k8s` already carries these; what is left is the tenant's.

| What                                                                                     | Where it is declared                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Workspace claim `blong-agent-workspace`, 10 Gi at `/srv/blong-agent`                     | `adapter/workspace.ts`, `k8sVolumes` |
| Harness claim `blong-agent-harness`, 1 Gi at `/home/node/.dsh`                           | `adapter/engine.ts`, `k8sVolumes`    |
| `AGENT_ENGINE_API_KEY` from the Secret `blong-agent-engine`, key `apiKey`                | `adapter/engine.ts`, `k8sEnv`        |
| 500m/1 Gi request, 2/3 Gi limit — a `deepseek` account runs the harness beside the realm | `adapter/engine.ts`, `k8sResources`  |
| The `rpc` and `http` ports on the process Service                                        | the generator, for every deployment  |

- **A writable workspace volume**, a claim rather than an `emptyDir`: a container restart must keep
  the edits a session made, or a resume replays a workspace that lost its work. `workspace.root` in
  the `release` block names the directory the claim is mounted at, so the two cannot drift apart
  unnoticed — an unmounted root is a directory the container writes into and a restart throws away.
- **One process per volume.** The workspace is the thing that cannot move between hosts; the worker
  resumes only a session whose `workerId` is its own `HOSTNAME`.
- **A model credential** in a Secret, never in a committed rc file: the Secret above supplies
  `AGENT_ENGINE_API_KEY`, and an account names it with `apiKeyEnv` rather than carrying `apiKey`. A
  deployment that creates the Secret with another name patches the reference, or names the variable
  itself.
- **The harness binary** for a `deepseek` account: the client spawns a `dsh` runtime, so the image
  has to carry it beside `@deepseek-ai/dsh-sdk-client` (`dshBin` on the account points at it). It is
  deliberately not a dependency of this monorepo — its install scripts need an approval the rush
  configuration does not grant — so the image is where the pin belongs.
- **An Ingress, if the API is called from outside the cluster.** No host is in the source: the
  address is the deployment's, so it comes from the rc file of the `k8s` intent, exactly as a
  portal's host does in `blong-sport`.
- **A question channel.** In the cluster that is `blong-chat` and its `chat.prompt.ask`; a
  deployment that points `questionMethod` at nothing will suspend every question after the timeout.

## Running it

```bash
# the schema
blong ./index.ts upgrade

# a developer's loop
blong ./index.ts dev

# the tests: ticket, session, workspace and recovery groups
CI=1 blong ./index.ts integration
```

`agent.http` plays the same calls by hand through `blong-dev proxy`.
