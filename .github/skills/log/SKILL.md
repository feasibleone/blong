---
name: blong-log
description: Access real-time application logs via REST API. Use this skill when you need to monitor application behavior, debug issues, verify that implemented features work correctly, search for errors, or trace requests across services. Provides filtering by level, service name, trace ID, and free text search.
---

# Monitoring Real-Time Logs

## When to Use

Use this skill whenever you need to:

- **Check for errors** after making code changes or starting a service
- **Verify behavior** by watching log output while testing a feature
- **Debug failures** by searching logs for error messages or stack traces
- **Trace a request** across services using a trace ID
- **Monitor a specific service** by filtering logs to its name

The log server runs at `http://127.0.0.1:9998` by default. All queries are via REST API using `curl`.

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

Returns the current server configuration including recognized property names and theme. Useful to discover what properties are available for filtering.

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

Use the `after` parameter with the last seen ULID to get only new entries (useful for continuous monitoring):

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
- **The buffer holds ~10,000 entries** by default. Older entries are evicted. Query promptly after reproducing issues.
- **The `after` parameter enables incremental polling** — store the last ULID and only fetch new entries.
- **Combine filters** for precision: `?level=error&name=gateway&search=timeout` returns only gateway errors mentioning "timeout".

## Storybook & Visual Testing

The LogViewer has a Storybook setup for interactive development and CI visual regression testing.

### Run Storybook Locally

```bash
cd core/blong-log
npm run storybook      # Dev server at http://localhost:6006
```

### Stories Available

| Story             | Description                                     |
| ----------------- | ----------------------------------------------- |
| DarkTheme         | Full sample data, dark mode (default)            |
| LightTheme        | Full sample data, light mode                     |
| Empty             | No entries, disconnected state                   |
| ErrorsOnly        | Only error-level entries                         |
| TraceFiltered     | Entries filtered to one distributed trace        |
| ServiceFiltered   | Entries filtered by service name                 |
| LevelFiltered     | Entries filtered to warn+ levels                 |
| WithSearch        | Pre-applied search text                          |
| LargeDataset      | 500 entries for performance testing (dark)       |
| LargeDatasetLight | 500 entries for performance testing (light)      |

### Visual Regression Tests

The test-runner uses Playwright to capture full-page screenshots and compare against baselines.

```bash
# Run visual tests (Storybook must be serving or use CI script)
npm run storybook:test

# CI pipeline: builds static Storybook, serves, tests, then exits
npm run storybook:test:ci

# Update snapshot baselines after intentional visual changes
npm run visual:update
```

PNG baseline images are stored in `src/client/__image_snapshots__/`.

### Key Files

| File                                  | Purpose                                  |
| ------------------------------------- | ---------------------------------------- |
| `.storybook/main.ts`                  | Storybook config (react-vite, addons)    |
| `.storybook/preview.ts`              | Global decorators, SVAR CSS import       |
| `.storybook/test-runner.cjs`         | Visual snapshot config (postVisit hook)  |
| `src/client/LogViewer.stories.tsx`   | All story definitions                    |
| `src/client/__fixtures__/data.ts`    | Deterministic test data                  |