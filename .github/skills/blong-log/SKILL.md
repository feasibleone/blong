---
name: blong-log
description:
    Use the Blong logging tools to monitor and debug applications via the real-time log server REST
    API (`http://127.0.0.1:9998`) and the `blong-dev log` CLI for on-disk entries. Provides
    filtering by level, service name, trace ID, and free text search. Use this skill whenever
    monitoring application behaviour, debugging issues, verifying feature behaviour, searching for
    errors, tracing requests across services, or checking logs after making code changes — even if
    logs aren't explicitly mentioned. For developing or extending the logging tooling itself, use
    the blong-log-dev skill instead.
---

# blong-log Skill

## What this skill covers

This skill is about **using** the Blong logging tools to monitor and debug applications:

- the **real-time log server** at `http://127.0.0.1:9998` — REST API + WebSocket fed by a UDP pino
  transport, and
- the **`blong-dev log` CLI** — reads the same entries persisted on disk by the `pino-cacache`
  transport, for inspection after the process has exited.

For **developing or extending** these tools (the log server, the pino transports, the
`blong-dev log` command, the LogViewer UI), use the **blong-log-dev** skill instead.

## Quick Reference

```bash
# Get the 20 most recent log entries
curl -s 'http://127.0.0.1:9998/api/entries?limit=20' | jq '.entries[]'

# Get recent errors only
curl -s 'http://127.0.0.1:9998/api/entries?level=error&limit=10' | jq '.entries[]'

# Search for a specific text across all log properties
curl -s 'http://127.0.0.1:9998/api/search?search=connection+refused' | jq '.entries[]'

# Filter by service name
curl -s 'http://127.0.0.1:9998/api/entries?name=gateway&limit=20' | jq '.entries[]'

# Trace a request across services
curl -s 'http://127.0.0.1:9998/api/entries?traceId=abc-123' | jq '.entries[]'

# Persisted entries from disk (pino-cacache) — condensed one-liners for agents
blong-dev log --level error
```

## REST API Endpoints

### GET /api/entries — Recent Entries

Returns the most recent log entries from the in-memory buffer. Supports filtering.

| Parameter | Type   | Description                                                           |
| --------- | ------ | --------------------------------------------------------------------- |
| `level`   | string | Minimum log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `name`    | string | Filter by service name (substring match, case-insensitive)            |
| `traceId` | string | Exact trace ID match                                                  |
| `search`  | string | Free text search across all properties                                |
| `after`   | string | Return only entries after this ULID (for pagination)                  |
| `limit`   | number | Max entries to return (default: 200)                                  |

Response shape:

```json
{
    "entries": [
        {
            "id": "<ulid>",
            "time": 1707840000000,
            "level": 50,
            "levelName": "error",
            "msg": "Connection refused",
            "name": "gateway",
            "traceId": "abc-123",
            "err": {"message": "ECONNREFUSED", "stack": "..."},
            "req": {"method": "POST", "url": "/api/transfer"},
            "res": {"statusCode": 502, "responseTime": 1234}
        }
    ],
    "total": 5432
}
```

### GET /api/search — Full Search

Same parameters as `/api/entries`, but searches the entire buffer instead of just recent entries.

### GET /api/config — Server Configuration

Returns the current server configuration including recognized property names and theme. Useful to
discover what properties are available for filtering.

## Common Workflows

### 1. Check for Errors After a Change

After editing code or restarting a service, check if any errors appeared:

```bash
curl -s 'http://127.0.0.1:9998/api/entries?level=error&limit=5' | jq '.entries[] | {msg, name, err: .err.message}'
```

If errors exist, get the full details including stack traces:

```bash
curl -s 'http://127.0.0.1:9998/api/entries?level=error&limit=1' | jq '.entries[0]'
```

### 2. Monitor a Specific Service

When working on a particular service, filter logs to just that service:

```bash
curl -s 'http://127.0.0.1:9998/api/entries?name=orchestrator&limit=30' | jq '.entries[] | {levelName, msg}'
```

### 3. Verify an API Call Worked

After triggering an API call, search for logs related to it:

```bash
# Search by the API method name
curl -s 'http://127.0.0.1:9998/api/search?search=userUserAdd' | jq '.entries[] | {levelName, msg, name}'

# Or search by an HTTP endpoint
curl -s 'http://127.0.0.1:9998/api/search?search=/rpc/user' | jq '.entries[] | {levelName, msg}'
```

### 4. Follow a Request Through Services

When debugging a multi-service flow, use the trace ID to see all related logs:

```bash
# First, find the trace ID from a recent request
curl -s 'http://127.0.0.1:9998/api/entries?search=transfer&limit=1' | jq '.entries[0].traceId'

# Then get all logs for that trace
curl -s 'http://127.0.0.1:9998/api/entries?traceId=THE_TRACE_ID' | jq '.entries[] | {name, levelName, msg}'
```

### 5. Poll for New Entries

Use the `after` parameter with the last seen ULID to get only new entries (useful for continuous
monitoring):

```bash
# Get initial entries
LAST_ID=$(curl -s 'http://127.0.0.1:9998/api/entries?limit=1' | jq -r '.entries[-1].id')

# ... wait, then get only new entries since last check
curl -s "http://127.0.0.1:9998/api/entries?after=$LAST_ID" | jq '.entries[] | {levelName, msg}'
```

### 6. Search for Warnings and Errors Together

```bash
curl -s 'http://127.0.0.1:9998/api/entries?level=warn&limit=20' | jq '.entries[] | {levelName, name, msg}'
```

### 7. Check HTTP Request/Response Details

Find log entries that contain HTTP information:

```bash
curl -s 'http://127.0.0.1:9998/api/search?search=statusCode' | jq '.entries[] | {msg, req: .req.method + " " + .req.url, status: .res.statusCode, time: .res.responseTime}'
```

### 8. Find Which Code Logged a Line

An unexplained line — an odd message, one nothing in the tree seems to write — is placed by naming
the caller of the messages that match a pattern. Each pattern is a regular expression source, so a
substring (`unauthorized`, `adapter.ready`) is written as one and `''` names the caller of every
record; the frame appears on the record as `site`.

```bash
# One process, while an unexplained line turns up in it
blong ./suite/blong-suite/index.ts dev --log.callSite=unauthorized --log.callSite=adapter.ready

# In a deployment, beside the other log settings
# config: {release: {log: {callSite: ['unauthorized']}}}
```

Nothing is captured for a message that matches none of the patterns, so leaving it configured costs
what the matched records cost. A call in pino's printf shape (`('unauthorized: %s', reason)`) is
always named, whatever the patterns say: no call site in this repository writes that shape, so one
arriving is a dependency's — which is how `@fastify/bearer-auth`'s refusal was found.

## Fetching Persisted Log Entries

Beyond the live log server, Blong's `pino-cacache` transport stores every log entry **on disk**
(default `~/.blong/log-cache`) with full detail, so they can be inspected later in greater detail
even after the process has exited. The VS Code extension reads this cache when you click a
`lukaot://t/<shape>` (or `lukaot://r/<id>`) link in the terminal. Coding agents can read it directly
with the `blong-dev log` CLI:

```bash
blong-dev log                                # recent entries, condensed one-liners
blong-dev log --level error --name gateway   # filter by level and service
blong-dev log <ulid>                         # one entry, in full (JSON)
blong-dev log --help                         # every filter and output mode
```

Output is `condensed` one-line text by default (never colorized, safe to grep), `pretty` for a human
and `json` for a script; a single ULID prints as JSON. Filters combine (`--level`, `--name`,
`--trace-id`, `--method`, `--search`, `--after`) and the command names each one in its own `--help`.

### Condensed output (for coding agents)

One plain-text line per entry, never colorized, so it is trivial to grep and parse:

```text
2024-02-13T16:02:00.000Z error orchestrator "Connection refused"  id=... traceId=...
```

Notes:

- A short summary (`N of M cached entries`) is written to **stderr**, keeping **stdout** clean for
  piping into other tools.
- `id` is the entry's ULID — pass it to `blong-dev log <ulid>` for the full record.
- Entries are listed **newest first** (ULIDs are monotonic with time).

## Log Entry Properties

Each log entry may contain these properties:

| Property    | Type   | Description                                                          |
| ----------- | ------ | -------------------------------------------------------------------- |
| `id`        | string | ULID — monotonically increasing, sortable                            |
| `time`      | number | Unix timestamp in milliseconds                                       |
| `level`     | number | Pino level: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal |
| `levelName` | string | Human-readable level name                                            |
| `msg`       | string | Log message                                                          |
| `name`      | string | Service/module name                                                  |
| `traceId`   | string | Distributed trace ID                                                 |
| `err`       | object | Error details: `{message, stack, type}`                              |
| `req`       | object | HTTP request: `{method, url, hostname, headers, body}`               |
| `res`       | object | HTTP response: `{statusCode, headers, body, responseTime}`           |
| `$meta`     | object | Blong framework metadata: `{mtid, method, ...}`                      |

## Tips

- **Use `jq` for readable output.** The raw JSON is dense; `jq` makes it readable.
- **Start with `level=error`** when debugging — narrow down before broadening.
- **Use `search` for fuzzy matching.** It searches across all properties including nested objects.
- **The `name` filter is a substring match**, so `name=gate` matches `gateway`, `gateway-auth`, etc.
- **The buffer holds ~10,000 entries** by default. Older entries are evicted. Query promptly after
  reproducing issues.
- **The `after` parameter enables incremental polling** — store the last ULID and only fetch new
  entries.
- **Combine filters** for precision: `?level=error&name=gateway&search=timeout` returns only gateway
  errors mentioning "timeout".

## Feeding a process into the viewer

The viewer shows nothing until a process hands it records, and where they go is configuration:

```yaml
log:
    destination: {port: 9999} # or 'udp://host:9999', or true for the defaults
```

The sink is lukaot's (`createUdpWriter` in `@feasibleone/lukaot/node`), so the common case needs no
package named in the configuration. A destination the framework does not ship is named as a module —
`{module, options}` — whose **default export** is called with the options and must answer a lukaot
`Writer` (`write(line, record)`); `setWriter(createUdpWriter({port: 9999}))` in code is the same
thing. A destination that cannot be built is reported (`log.destination: … could not be imported`)
and skipped rather than thrown, so a wrong address costs records and not the process (@@D-930).

## Extending the log tooling

`blong-dev log` is the intended way for coding agents to read persisted log entries. It is
deliberately small: a handful of filters and three output modes. When a debugging task needs
something it does not yet cover — a new filter (e.g. by `context`, `req.url`, or a time range), a
new output mode, or a different cache location — **extend the tool** instead of working around it
with shell one-liners:

- The command lives in `tools/blong-dev/src/commands/log.ts`, is registered as `log` in
  `tools/blong-dev/src/cli.ts`, and is exported from `tools/blong-dev/src/index.ts`.
- Add a filter by following the existing `--level` / `--name` / `--trace-id` pattern, and document
  it in the help registry (`tools/blong-dev/src/help/commands.ts`) so `blong-dev log --help` shows
  it.
- Keep `condensed` plain and parseable (no ANSI), keep summaries on **stderr**, and list newest
  first — agents and scripts rely on that.
- Full internals, the on-disk storage format, and step-by-step extension guidance are in the
  **blong-log-dev** skill.

## Runtime Introspection Endpoints

In addition to log-based monitoring, the framework provides built-in HTTP endpoints that expose
internal runtime state. These are complementary to log tailing — use them to inspect
**configuration, registered ports, handlers, and modules** at a point in time rather than tracing
events through time.

They are enabled by default in the `dev` intent. When debugging requires something not available in
the introspection endpoints, consider extending the framework to expose it, see `SystemDebug.ts`.

### Available Endpoints

All endpoints are `GET` with no auth by default:

```bash
# Effective runtime config (full merged snapshot — includes all activated config blocks)
curl http://localhost:8080/api/sys/config | jq .

# All registered adapter/orchestrator port names
curl http://localhost:8080/api/sys/ports | jq .ports[]

# All handler method groups with handler counts per group
curl http://localhost:8080/api/sys/methods | jq '.methods[] | "\(.name): \(.handlerCount)"' -r

# All registered realm module names
curl http://localhost:8080/api/sys/modules | jq .modules[]

# Internal RPC server address
curl http://localhost:8080/api/sys/rpc | jq .
```

### Typical Troubleshooting Workflow

Use logs and introspection endpoints together:

```bash
# 1. Check if the expected ports are registered
curl -s http://localhost:8080/api/sys/ports | jq .ports[]
# → is "myRealm.myAdapter" in the list?

# 2. Check if the expected handlers are registered
curl -s http://localhost:8080/api/sys/methods | jq '.methods[] | select(.name | contains("myRealm"))'
# → are the method groups present with the right handler counts?

# 3. Check the effective config for a specific key
curl -s http://localhost:8080/api/sys/config | jq '.myRealm.myAdapter'
# → is the config value what you expect?

# 4. Correlate with logs if something looks wrong
curl -s 'http://127.0.0.1:9998/api/entries?level=error&limit=10' | jq '.entries[] | {msg, name}'
```

### Skill maintenance

When adding new features to the logging or introspection tooling, update this skill to include the
new capabilities and usage patterns.

## Call records (the flow ledger's input)

`call start` / `call end` / `call error` / `call received` / `call answered` are **not level
records**: they go through the call channel (`log.calls`), they are produced for a whole flow or not
at all, and by default they are **stored and sent to the service but not printed** — a quiet stdout
is not evidence that nothing was recorded. The level is not what decides them: the channel binds its
own logger at `debug` so a process configured at `info` still produces them, and the write path
skips the terminal for them unless `log.calls.stdout` asks.

```bash
# Show them on stdout for a run (they still reach the cache and the service)
blong-watch -- microservice integration dev --log.calls.stdout=true

# Read them back after a run, exactly as they were retained
blong-dev log --search "call received"

# Opt a high-throughput flow out (matched against the entry method it was minted with)
blong ... --log.calls.off=payment --log.calls.off=ledger.entry.post

# Ask for one flow's calls on a running deployment (gateway verifies, then forgets the token)
blong grant calls --ttl=15m
curl -H "x-blong-grant: <token>" ...          # a 401/403 request records no calls: nothing ran
```

### Turning recording on and off

The switch has three grains, and the one you want depends on how long you need it:

| Grain                                 | How                                                                                          | Lives                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| One flow                              | the `calls` capability, published with the flow (a grant header turns it on for one request) | the execution              |
| The whole process, from configuration | `log.calls: {enabled, off, stdout}`                                                          | re-read on a config reload |
| The whole process, right now          | `api.log.setCallRecording({enabled: false})`                                                 | until the next patch       |

`setCallRecording` is deliberately plain: it patches `callTrace.ts`'s module configuration, so
**anything** that decides can drive it without the log learning about that source — an operator's
endpoint today, a value the deployment keeps in its database tomorrow. A config change on disk
already reaches it: the watch loop's reload asks the log component (`configChanged`), which is the
one path a non-port component gets, so `log.calls` moves in a **running** process without a reload
of the process. The change reports itself as `frameworkCallRecordingChanged`, because a flow page
that is empty has to say whether that was a decision or a fault.

A switch decides the **next** flow: the capability is published with the execution it belongs to, so
a flow already running keeps the answer it entered with. That is why turning recording off quiets a
deployment within a request or two rather than instantly.

### `x-blong-grant` — asking for one request's calls

The per-flow grain is a header. A deployment that records nothing useful can turn recording on for
the one call it is investigating, instead of restarting with a louder configuration:

```bash
# Mint: one signed token, one capability, fifteen minutes by default
TOKEN=$(blong grant calls --ttl=15m)

# Use: the next request records its calls; every other request still records nothing
curl -H "x-blong-grant: $TOKEN" -H 'authorization: Bearer …' http://host:8080/rpc/blong/flow/find
```

What the header _is_: a short-lived JWT signed with the **gateway's own sign key** — the key already
configured as `gateway.sign` (or `gateway.grant.key`), whose public half the running gateway holds.
It carries `cap` (the capabilities it asks for, `['calls']` today) and `exp`. The gateway verifies
it once, at its earliest hook, before authentication and before the route runs, and republishes the
answer as the `calls` capability inside the flow's identity — the token itself is **not forwarded**,
so a downstream process reads a decided capability and needs no key of its own. Because the decision
is a capability rather than a config value, it wins over `log.calls`: a grant turns recording **on**
for its request even when the process has it off, which is exactly what makes it usable on the
deployment that is misbehaving.

Two properties worth knowing when using it:

- **A bad grant is no grant, never a rejection.** Absent, malformed, expired, wrongly signed or
  naming a capability this build does not know all answer `undefined`, and the request proceeds with
  recording off. A telemetry switch must not be able to fail the call it was meant to illuminate.
- **A public key verifies.** The gateway is handed the public JWK by the MLE plugin, so private
  material never appears in a config snapshot; verification needs the public half and nothing else.
  Only a **generated** key (no `gateway.sign`, no `gateway.grant.key`) verifies nothing, because a
  key that exists in one process cannot check a token minted elsewhere.

In a spec, mint it and apply it to the browser context — this is how the flow-diagram specs prove
they depend on call records instead of on a default:

```ts
import {mintGrant} from '@feasibleone/blong-gogo/grant.ts';

test.use({extraHTTPHeaders: {'x-blong-grant': await mintGrant({cap: ['calls']})}});
```

Minted with no key on purpose: it falls back to the committed development sign key, which is what
the `dev` intent configures — so a checkout and CI agree without a secret. The suites that use this
(`core/blong-realm`, `realm/blong-gateway`, `realm/blong-commander`) set
`log: {calls: {enabled: false}}` in their `playwright` block, so an execution on the flow page can
only have come from a granted request.

### What reaches the service

A record is attributable two ways — it names a declared signal, or it belongs to a flow — and the
sink and the ingest refuse only a record that names neither. A served request's records name no
declaration (a realm's `log.info` does not), so the **flow** is what carries them to the ledger; a
record with neither is dropped before it leaves the process, which is why `blong-dev log` can show a
line the flow page has nothing to draw from (`@@D-940`).

The files to read when this needs changing, all of them current:

- `core/lukaot/src/capability.ts` — the ambient `calls` switch, the `cap` field of the identity
  header, the five phases and `createCallChannel`.
- `core/blong-gogo/src/callTrace.ts` — the configuration, the opt-out patterns, the record envelope,
  and `patchCallTrace`, the seam a runtime or a database source pushes a change through.
- `core/blong-gogo/src/LukaotLog.ts` — where the channel is built (its own `debug` logger), where a
  call record is kept off the terminal, and `setCallRecording`/`configChanged`.
- `core/blong-gogo/src/frameworkSignals.ts` — `frameworkCallRecordingChanged`.
- `core/blong-gogo/src/Watch.ts` — `applyConfigReload`, the one place a reload reaches a component
  that is not a port.
- `core/blong-gogo/src/grant.ts` and `bin/blong.ts` — `blong grant calls` mints and verifies the
  per-flow grant.
