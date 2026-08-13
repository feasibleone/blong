---
name: blong-log
description: Use the Blong logging tools to monitor and debug applications via the real-time log server REST API (`http://127.0.0.1:9998`) and the `blong-dev log` CLI for on-disk entries. Provides filtering by level, service name, trace ID, and free text search. Use this skill whenever monitoring application behaviour, debugging issues, verifying feature behaviour, searching for errors, tracing requests across services, or checking logs after making code changes — even if logs aren't explicitly mentioned. For developing or extending the logging tooling itself, use the blong-log-dev skill instead.
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
            "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
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

## Fetching Persisted Log Entries

Beyond the live log server, Blong's `pino-cacache` transport stores every log entry **on disk**
(default `~/.blong/log-cache`) with full detail, so they can be inspected later in greater detail
even after the process has exited. The VS Code extension reads this cache when you click a
`blong://log/<ULID>` link in the terminal. Coding agents can read it directly with the
`blong-dev log` CLI:

```bash
# Recent entries, condensed one-liners (default — ideal for agents to grep)
blong-dev log

# Only errors from a specific service
blong-dev log --level error --name gateway

# Human-readable, colorized
blong-dev log --output pretty

# Full JSON (id/time restored) for scripting
blong-dev log --output json

# Fetch one entry by its ULID
blong-dev log 01ARZ3NDEKTSV4RRFFQ69G5FAV

# Custom cache location (default ~/.blong/log-cache, or $BLONG_LOG_CACHE)
blong-dev log --cache-path /path/to/log-cache
```

### Options

| Option         | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `--cache-path` | cacache directory (default `~/.blong/log-cache`, or `$BLONG_LOG_CACHE`)     |
| `--output`     | `condensed` (default for lists), `pretty`, `json` (default for single ULID) |
| `--level`      | Minimum level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`           |
| `--name`       | Filter by service name (case-insensitive substring)                         |
| `--search`     | Free-text search across all entry properties                                |
| `--trace-id`   | Filter by exact trace ID                                                    |
| `--method`     | Filter by `$meta.method` (case-insensitive substring)                       |
| `--after`      | Only entries newer than this ULID (pagination)                              |
| `--limit`      | Max entries (default 50; `0` = all)                                         |
| `--no-color`   | Disable ANSI colors in `pretty` output                                      |

### Condensed output (for coding agents)

One plain-text line per entry, never colorized, so it is trivial to grep and parse:

```
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

- **Use `jq` for readable output.** The raw JSON is dense; `jq` makes it scannable.
- **Start with `level=error`** when debugging — narrow down before broadening.
- **Use `search` for fuzzy matching.** It searches across all properties including nested objects.
- **The `name` filter is a substring match**, so `name=gate` matches `gateway`, `gateway-auth`, etc.
- **The buffer holds ~10,000 entries** by default. Older entries are evicted. Query promptly after
  reproducing issues.
- **The `after` parameter enables incremental polling** — store the last ULID and only fetch new
  entries.
- **Combine filters** for precision: `?level=error&name=gateway&search=timeout` returns only gateway
  errors mentioning "timeout".

## Extending the log tooling

`blong-dev log` is the intended way for coding agents to read persisted log entries. It is
deliberately small: a handful of filters and three output modes. When a debugging task needs
something it does not yet cover — a new filter (e.g. by `context`, `req.url`, or a time range), a
new output mode, or a different cache location — **extend the tool** instead of working around it
with shell one-liners:

- The command lives in `core/blong-dev/src/commands/log.ts`, is registered as `log` in
  `core/blong-dev/src/cli.ts`, and is exported from `core/blong-dev/src/index.ts`.
- Add a filter by following the existing `--level` / `--name` / `--trace-id` pattern and document it
  in the `blong-dev log` options table above.
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
