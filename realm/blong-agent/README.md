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
its own namespace. Each account names a `kind` (`vercel`, `mastra`, `deepseek`, `copilot`, `sim`)
and a `mode`:

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

A `copilot` account drives the Microsoft Copilot SDK — the harness behind the Copilot CLI — against
a runtime server on another host, with BYOK and no GitHub subscription (`@@D-970`, `@@D-973`). The
harness owns the loop and its own file, shell and compaction tools, so this kind is offered only
`askHuman` and `finish`: the two the realm can bridge back to its own tool boundary. A question
parks the session exactly as it does for a step engine, and the answer is resumed as the next turn
of the same runtime session @@D-976.

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

The rc file is YAML and is addressed the way every component is — `<realm>.<instance>.<key>` — so an
account is `agent.engine.accounts.<alias>` under the suite root:

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
            # The Copilot harness on a server of our own. One account per runtime, because a session
            # lives in the runtime that holds it @@D-972, and the workspace is the folder on that
            # server which the agent clones into @@D-978.
            copilot:
                kind: copilot
                runtimeUrl: 10.0.1.10:4321
                runtimeTokenEnv: COPILOT_CONNECTION_TOKEN
                workspaceRoot: /var/lib/blong/workspaces
                # The provider's own model id (`GET /v1/models` answers `deepseek-flash`,
                # `deepseek-v4-pro`; `deepseek-chat` is the retired name DeepSeek still answers), and
                # a baseUrl in the shape `provider` names: `/v1` for the default OpenAI wire,
                # `/anthropic` only together with `provider: anthropic`
                modelName: deepseek-flash
                baseUrl: https://api.deepseek.com/v1
                apiKeyEnv: AGENT_ENGINE_API_KEY
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
| `agent.agentDispatch.shellEnabled`                     | whether a session may run commands, a native engine included       |
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

### Provisioning a tenant

A deployment is a declaration plus the few things that have to exist before the operator can be
asked to reconcile one. Everything else is the operator's, from the tree this plan produces: the
ServiceAccount its Jobs run under, the role that carries the k8s adapter's verbs, the fill and
migration Jobs, the processes and the Ingresses.

Provisioning is three steps, and the first two are `init` and an editor:

```bash
blong-kustomize init                      # writes system/provision/: namespace, the draft declaration,
                                          #   the RBAC a pass may not write, the rc file and a master key
$EDITOR system/provision/rc/blong_releaserc
blong-kustomize provision                 # seals what is secret, creates the key's Secret, applies all of it
```

`blong-kustomize provision` with no verb is the whole of a tenant's half: every value marked
`# seal` — or held under a name that is a secret by convention — is replaced with `${decrypt('…')}`,
the `blong-master-key` Secret is created from the tenant's key when the namespace has none, and the
folder is applied in the order its kustomization lists: namespace, grants, declaration, rc Secret.
The verbs (`seal`, `apply`, `verify`, `restore`) exist for the parts a reader wants on their own.

What the page owes a reader is the _why_ of that shape, because it is the part a command cannot
state:

- **The data goes first, and only once.** The first converge is a migration _beside_ the data rather
  than a fill of it: everything the Slack app needs — the workspace's signing secret, the account
  rows, the channel memory — is in the database the previous deployment wrote.
  `provision restore --dump=FILE` is optional for exactly that reason: a green-field deployment has
  nothing to copy, and a cut-over copies before it declares anything.
- **The operator cannot grant itself.** Its rights in this namespace are the one object a pass
  refuses to write, so they are not in the tree: `init` writes them beside the declaration, from the
  operator's own rules, and `provision` applies them before it applies anything that needs them
  @@D-1020.
- **The rc file is the tenant's answer, and its secrets are sealed.** `system/provision/` is
  generated and not committed — the folder is derived from a deployment, so a clone would carry a
  stale copy of answers it does not hold — and a value in it is ciphertext once `provision` has run
  @@D-1023.
- **The declaration is a draft until a release names an artifact.** `init` writes it with
  `spec.draft: true`: a CR has to exist before the release that patches it can, and until then the
  artifact it names is a 404, so the operator reports `phase: Draft`, writes no tree, and claims no
  host until a release names the artifact and clears the field @@D-1019.

### Cutting over from the chat deployment

`blong-chat` was the deployment that answered Slack, kept the accounts and served the portal. This
realm takes that place, and the tenant's two addresses do not move with it: the portal stays on
`chat.feasible.one` and the webhook on `chat-hook.feasible.one`, because a DNS record, a certificate
and a Slack app's request URL are what the tenant already has. The CR carries both, copied from the
chat declaration unchanged; the only values that differ are the suite's own names.

The sequence is `provision all --dump=<previous>.sql` — the copy, then the tenant's resources, then
the declaration — followed by the release, and one last step the operator cannot take: the old
declaration is retired once the new portal answers, by deleting it and its Ingresses. One Ingress
per host, so two declarations serving the same host are two claims on one address, and a pass prunes
only what its _own_ declaration stopped naming — a deleted declaration is not a pass, which is why
the Ingresses of the retired one go with it. Its namespace stays: it holds the old pods and the
certificate Secret whose place the new one takes.

From here the two realms are one deployment rather than two: an agent asks through `chat.prompt.ask`
and a person answers in Slack, and the dispatch that answers a question is also what a future Slack
trigger calls to start a task.

### A Copilot runtime server

A `copilot` account does not run a model in the realm's process: it attaches to a runtime server
that owns the harness, the tools and the session store, usually on a machine that exists to do the
work @@D-971. The realm runs in the cluster, the runtime on its own host, and the two differ in one
respect that matters — the ticket's workspace is **on the runtime host**, not in the realm's pod
@@D-978.

What the runtime host needs:

- **A working folder** — `/var/lib/blong/workspaces` in the examples — writable by the runtime's
  user, and existing before the first claim: the runtime refuses a session whose `workingDirectory`
  is not a directory, and nothing on this side can create one on another host. An account names it
  as `workspaceRoot`, the claim records it as the session's workspace and prepares nothing locally,
  and one folder per host is enough because one worker runs on each.
- **GitHub access** — one fine-grained token for the git work and the API work both. The agent
  clones, pulls and pushes with the harness's git, and the harness's bundled skills shell out to the
  `gh` CLI for pull requests, issues, `gh api` and CI status, so a deploy key is not enough: it
  reaches git and nothing else. The token goes into the worker's environment as `GH_TOKEN` —
  GitHub's own guidance for a fine-grained token, rather than `gh auth login --with-token` — and git
  presents it through gh's credential helper, so no second secret is needed. Grant it only the
  repositories this worker serves, with Contents read/write, Pull requests read/write, Issues
  read/write, Checks read and Actions read — plus Workflows read/write only where a ticket may push
  a workflow file — and let it expire: the agent runs as the user that owns the token, so a ticket
  that reads its own environment can read the token too.
- **A trusted working root.** The agent does the clone, the pull and the push itself, so the folder
  it works in must be trusted: `git config --global --add safe.directory <workspaceRoot>`.
- **The runtime itself**, from the release archive of the CLI (`package/prebuilds/<platform>/`
  inside a `github-copilot-<version>-<platform>.tgz`), versioned to match the SDK, or the
  `ghcr.io/github/copilot-cli` image.
- **A persistent state directory** for `COPILOT_HOME`, and a session idle timeout longer than the
  realm's `questionTimeoutMs` by a wide margin: a parked ticket's runtime session must outlive a
  person thinking, or the resume names a session the runtime has reaped.

The token itself is not something `gh` can mint: `gh auth token` only prints the broad OAuth token
the CLI already holds, which reaches every repository its user can write and is a workable stand-in
on a developer host rather than a server credential. A fine-grained token comes from the web, at
`Settings → Developer settings → Personal access tokens → Fine-grained tokens` — an organisation
issues its own, which may need approval — or, where those are unavailable, a classic token with the
`repo` and `workflow` scopes.

**One script provisions all of it**: `realm/blong-agent/copilot-runtime.sh` creates the user, the
workspace and state directories, the git defaults and the trusted working root, installs `gh`,
writes the unit and its environment file (`/etc/blong/copilot-worker.env`, root-only, holding the
connection and GitHub tokens), proves both credentials against their APIs, and verifies the worker
answers before reporting success. It pins the runtime to the version the SDK declares — and `gh` to
a version of its own — checks both archives against their published checksums, and keeps each
runtime version under `/opt/copilot/releases/` with `/opt/copilot/current` pointing at the active
one, so an upgrade is reversible. Re-running it upgrades, keeps the secrets the file already holds,
and applies a new one when the file carries it.

```bash
# the secrets first, in the file the worker keeps anyway; nothing secret on the command line
sudo install -d -m 750 /etc/blong
sudo install -m 600 /dev/null /etc/blong/copilot-worker.env
sudo -e /etc/blong/copilot-worker.env     # GH_TOKEN=... and COPILOT_PROVIDER_API_KEY=...
sudo bash realm/blong-agent/copilot-runtime.sh 192.168.8.100
```

The script reads `GH_TOKEN` and `COPILOT_PROVIDER_API_KEY` out of that file before it writes it
back, so a secret seeded there needs no flag, and rotation is an edited line and a re-run. A file is
also the only quiet way to carry one. `sudo GH_TOKEN=... bash ...` does work — Ubuntu's default
`%sudo ALL=(ALL:ALL) ALL` implies the `SETENV` tag, so sudo hands the assignment to the script — but
the assignment sits in sudo's own argument list, which `/proc/<pid>/cmdline` leaves readable to
every user on the host, and sudo waits for the script, so that is the whole install; the line you
typed is in your shell history besides. Neither is where a repository or model token belongs.

The GitHub token is written into that environment file as `GH_TOKEN`, so `git pull`, `git push`,
`gh pr create` and `gh run list` authenticate with it; editing that line and re-running rotates it.
The provider key is different: it is stored for running the CLI by hand, and a realm session carries
its own from the account's `apiKeyEnv`, so a worker without one still serves tickets. Both are
checked before the worker starts: the token against the API, and with `GH_REPO=owner/name` push
rights and CI read on that repository as well; the provider key against the provider's model list,
which costs no tokens. A key given on this run has to work or the script stops; one it finds in the
file only warns, because a realm session carries its own. The server runs headless and is reached
over plain TCP:

```bash
# a token every client must present; a non-loopback bind refuses to start without one
export COPILOT_CONNECTION_TOKEN="$(openssl rand -hex 32)"
export COPILOT_HOME=/var/lib/blong/copilot-state
/opt/copilot/current/package/prebuilds/linux-x64/copilot-runtime --server --host 0.0.0.0 \
    --port 4321 --session-idle-timeout 604800
```

```ini
# /etc/systemd/system/copilot-worker.service — the shape copilot-runtime.sh writes
[Unit]
Description=Copilot runtime for blong-agent
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
User=copilot
Group=copilot
WorkingDirectory=/var/lib/blong/workspaces
EnvironmentFile=/etc/blong/copilot-worker.env
ExecStartPre=/usr/bin/test -d /var/lib/blong/workspaces
ExecStart=/opt/copilot/current/package/prebuilds/linux-x64/copilot-runtime --server \
    --host 0.0.0.0 --port 4321 --session-idle-timeout 604800
Restart=always
RestartSec=5
TimeoutStopSec=60
UMask=0077
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

- **Keep the port private.** The connection is plaintext JSON-RPC over TCP and the token is sent
  unencrypted, so the port belongs on a private network with a firewall rule naming the realm's
  source addresses — never on a public interface. `--host 127.0.0.1` and a local runtime is the
  developer setup: the `copilot` intent's `laptop` account names `/tmp/blong-agent/workspaces`, so
  start the runtime in that folder before `integration copilot` claims against it.
- **One account per host.** A session lives in the runtime that holds it, and a resume has to reach
  that runtime, so `srv1` and `srv2` are two accounts rather than a pool inside one.
- **The token as a client-side secret.** The account names `runtimeTokenEnv`, which is the _name_ of
  a variable a deployment fills from its own Secret; an account that carries the value itself says
  `runtimeToken` instead. A token pasted into `runtimeTokenEnv` resolves to nothing — the client
  looks for a variable with that name — and the runtime answers `AUTHENTICATION_FAILED`, which is
  why the client refuses an account with no token on a remote endpoint and names the field rather
  than the value. The model key travels separately, as `apiKeyEnv`.
- **A check before believing it:** `blong-dev call engine.account.check --payload.account=srv1`
  answers `{reachable, kind: 'copilot', mode: 'native', tools}` after a ping, and
  `{reachable: false, error}` when the runtime does not answer — the reason travels with the
  verdict, because a refused token, a missing token and a dead host otherwise read the same. Two
  things about that command: the option is `--payload.account`, because everything else on the line
  is the command's own flags, and the call must name the run it asks. The method is the engine
  adapter's, and `gateway/engine/engine.account.check.ts` is what publishes it — a path nobody
  serves answers `Not Found`, or `gateway.mleUndecoded` when the params arrive encrypted, which
  reads as a cipher problem and is a missing route.

```yaml
# .blong_callrc beside this file — git-ignored, because it carries a password. It is what makes the
# call reach the local run, and `route` is what keeps `engine.*` from falling through to another
# file's server.
server:
    local:
        url: http://localhost:8080
        username: testAdmin
        password: testPassword
route:
    engine.: local
```

```bash
blong-dev call engine.account.check --payload.account=srv1
```

`--target http://localhost:8080` names the same run without a file, but it carries no credentials of
its own: the login then has to come from the file's top-level `username`/`password` or from
`MLE_USERNAME`/`MLE_PASSWORD`.

Without a target or a route the command falls back to the only server the repository's own rc
declares, which is a deployment that has no such method — and its refusal is the same
`gateway.mleUndecoded`.

## Running it

```bash
# the schema
blong ./index.ts upgrade

# a developer's loop
blong ./index.ts dev

# the tests: ticket, session, workspace, recovery and native groups
CI=1 blong ./index.ts integration

# the same, with the Copilot accounts: `srv1`, `srv2`, and a runtime started by hand as `laptop`
# (the account names `AGENT_ENGINE_API_KEY`; a run without it reaches the runtime and fails the model)
AGENT_ENGINE_API_KEY=… CI=1 blong ./index.ts integration copilot
```

`agent.http` plays the same calls by hand through `blong-dev proxy`.
