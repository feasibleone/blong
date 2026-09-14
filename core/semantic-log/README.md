# semantic-log

Structured logging that keeps one readable line on stdout and gives **every record a locally-minted
cross-reference id**, so a human or an agent can reach the full detail on demand instead of
grepping.

- What it is, in one page: [concept](../../docs/blong/docs/concepts/semantic-log.md)
- Why it is built this way: [rationale](../../docs/blong/docs/rationale/semantic-log.md)
- How to use it, and what the flows demonstrate:
  [pattern](../../docs/blong/docs/patterns/semantic-log.md)
- The two sequence diagrams, annotated leg by leg:
  [flow walkthrough](../../docs/blong/docs/patterns/semantic-log-flows.md)

## Status

Part of the Blong monorepo. **Not installable from npm as it stands**: `exports` point at TypeScript
sources and the package is `"private": true` — the same convention as `core/blong-lint`. Inside the
monorepo it works with no build step.

| Surface                                                                    | State       |
| -------------------------------------------------------------------------- | ----------- |
| Emitter, rendered format, references, cache, CLI                           | implemented |
| Cluster service (registry, detectors, digest, correlation, search, facets) | implemented |
| Flow fixtures (`flow/`) and the runner                                     | implemented |

Every v1 requirement is mapped to the test that demonstrates it, and the mapping is **checked** (the
named file must exist and must contain the named test): `test/flow/coverage.test.ts`. The capability
parity matrix is audited by `test/parity.test.ts`, which also records what a row does **not**
deliver rather than weakening the claim; the one outstanding gap is the HTTP half of the R19 payload
reference (a payload lives in the emitter's local cache, and the wire carries no payload body).

## Quick start

```typescript
import {createLogger} from '@feasibleone/semantic-log';

const logger = createLogger({service: 'checkout'});

logger.info('transfer prepared', {amount: 100});
logger.error('settlement failed', {err: new Error('connection timeout')});
```

One greppable header line, with indented detail beneath it:

```text
2026-09-13T10:11:12.345Z info  checkout transfer prepared [r=semantic-log://record/01J8Z9… t=semantic-log://template/9f3a2c1d4e5f]
2026-09-13T10:11:12.346Z error checkout settlement failed [r=semantic-log://record/01J8ZA… t=semantic-log://template/1b2c3d4e5f60]
  error  Error: connection timeout
    at Socket.handleTimeout (/app/src/net/pool.ts:42:12)
```

Nothing needs configuring for this to work — no service, no transport, no schema.

## Configuration

| Option          | Default             | Meaning                                                                                                                            |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `service`       | _required_          | service name; carried on every record and rendered in the header                                                                   |
| `level`         | `info`              | threshold; `logger.setLevel()` changes it at run time                                                                              |
| `version`       | the package version | carried in every record's base fields                                                                                              |
| `context`       | —                   | a context label (component or module) for the whole logger                                                                         |
| `bindings`      | `{}`                | fields merged into every record; inherited by `child()`                                                                            |
| `format`        | `human`             | `human` or `json` (one JSON object per record)                                                                                     |
| `color`         | `false`             | ANSI colour in human format. Opt-in: nothing inspects a TTY, so a piped or captured run gets plain text unless colour is asked for |
| `writer`        | `stdoutWriter`      | the primary destination; `setWriter(null)` silences it process-wide                                                                |
| `sinks`         | `[]`                | extra destinations, fanned out after the primary (`createLogger({sinks: [createServiceWriter({url})]})`)                           |
| `cache`         | —                   | retains records on disk so a printed reference can be resolved later                                                               |
| `payloads`      | —                   | retains large field values, which then render as a `semantic-log://payload/…` reference                                            |
| `redact`        | `[]`                | field paths replaced with `[redacted]` **before** identity is derived                                                              |
| `writeLimit`    | `1000`              | max queued cache writes; excess is dropped and counted                                                                             |
| `withholdLimit` | `500`               | max withheld entries held for escalation                                                                                           |
| `now`           | `Date.now`          | clock, injectable for tests                                                                                                        |
| `exit`          | `process.exit`      | used by the fatal path; injectable so tests do not terminate                                                                       |

A sink is drained separately from the write tracker, so a caller that shuts down must flush the
logger **and** its sinks to be sure the last record arrived.

## Levels

| Name  | Value |
| ----- | ----- |
| trace | 10    |
| debug | 20    |
| info  | 30    |
| warn  | 40    |
| error | 50    |
| fatal | 60    |

Custom levels are allowed: a name is accepted alongside the number.

## The record

`logger.info(msg, fields)` — the second argument **is** the field bag. `err`, `req`, `res`,
`messageId` and `operation` are lifted out of it into slots of their own; every other key lands in
`record.fields` under its own name. Wrapping the bag (`{fields: {...}}`) stores it one level too
deep, where it renders as a single opaque line and is read by nothing.

Each record carries a `flow` position, the `intent` of the request that caused it, a `refs.parent`
pointing at the record that caused it in the same scope, and a reference group:

```text
2026-09-13T10:11:12.345Z info  checkout transfer prepared
  [r=semantic-log://record/01J8Z9… t=semantic-log://template/9f3a2c1d4e5f x=semantic-log://trace/tr-1 p=01J8Z8…]
```

`r` is the record, `t` the template identity, `x` the trace, `p` the causal parent — a bare id
rather than a `semantic-log://` URI, because it is a link within the `r=` family, but it resolves
through the same store as any other record reference. All of them resolve on demand; see
[Resolving a reference](#resolving-a-reference).

## Resolving a reference

The inspector reads exactly **one file** per lookup; it never enumerates the cache. Flags may appear
before or after the reference.

```bash
node bin/semantic-log-inspect.ts --cache <dir> <reference|id>
node bin/semantic-log-inspect.ts --cache <dir> --json <reference|id>            # machine-readable
node bin/semantic-log-inspect.ts --cache <dir> --expect-retained <reference|id>
```

| Flag                | Effect                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `--cache <dir>`     | the cache root; `~/.semantic-log/cache` when omitted                                       |
| `--json`            | the machine-readable rendering instead of the readable one                                 |
| `--expect-retained` | the caller states the reference was once live, so an absent entry is _pruned_, not unknown |

The reference's own kind chooses the store: `semantic-log://record/<id>` reads the record half and
`semantic-log://payload/<id>` the payload half, while a bare id is read as a record. Exit codes say
_why_ a lookup did not produce a record, because that is the difference between a typo and a
retention bound:

| Exit | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | resolved and printed                                             |
| 1    | unknown reference                                                |
| 2    | not retained (pruned) — only reachable with `--expect-retained`  |
| 3    | usage error, including a `--cache` directory that does not exist |

The store cannot tell a pruned entry from one that never existed — pruning removes the index line as
well as the file, so no trace of the id survives — so the distinction is **not** guessed from the
id's shape or age. `--expect-retained` lets the caller, who knows the reference was once live, state
that expectation explicitly. The CLI refuses a missing cache directory rather than creating it: a
typo in `--cache` would otherwise resolve every reference as unknown against a store it had just
invented.

## The cluster service

Optional. Without it everything above still works; with it, records are grouped, counted and
watched.

```bash
node bin/semantic-log-service.ts                     # port 9455, offline embeddings, in-memory
node bin/semantic-log-service.ts --port 9455 --host 127.0.0.1 \
    --persist ./registry.json --embedding offline
```

| Flag                | Default     | Meaning                                                                                                                                                                                                                                              |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port`            | `9455`      | listen port                                                                                                                                                                                                                                          |
| `--host`            | `127.0.0.1` | bind address                                                                                                                                                                                                                                         |
| `--persist <file>`  | —           | JSON snapshot of the **template registry**, restored on start and saved on every change                                                                                                                                                              |
| `--embedding`       | `offline`   | `offline` (deterministic, no network, no model download — the default, and what CI uses), `local` (an in-process transformer model from an optional package, loaded lazily and downloaded on first use) or `remote` (any OpenAI-compatible endpoint) |
| `--embedding-url`   | —           | endpoint for `--embedding remote`                                                                                                                                                                                                                    |
| `--embedding-model` | —           | model name for `--embedding remote`                                                                                                                                                                                                                  |

`local` needs its optional provider package installed, which the package does not declare; a load
failure is reported as a named error rather than an opaque module-resolution crash, because "not
installed" is an expected state for it. **Embedding vectors are not interchangeable across
providers**: the default dimension is 64 for `offline`, 384 for `local` and 1536 for `remote`, and a
centroid is only comparable with vectors from the provider that produced it — a deployment that
changes provider starts a registry whose stored centroids it cannot compare against.

**The registry is the only durable artifact.** The digest, causal lineage, incident store and
flow-drift history are process-lifetime surfaces and are deliberately not persisted. A snapshot that
cannot be read does not stop the service: it is moved aside to `<file>.corrupt` (kept, never
deleted) and the service starts empty and says so, rather than refusing to serve telemetry over one
bad cache file.

| Route                                                   | Returns                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /events`                                          | accepts a batch, `202`; the emitter never waits on it                           |
| `GET /health`                                           | liveness                                                                        |
| `GET /templates`                                        | the registry — refs, counts, first/last seen, alerts, intents                   |
| `GET /templates/:ref`                                   | one entry; `404` when unknown                                                   |
| `GET /templates/:ref?facet=ops\|diagnostic\|compliance` | a read-time projection; an unknown facet is a `400`                             |
| `POST /templates/:ref/retire`                           | stamps `retiredAt` (retiring does not delete) and publishes the delta           |
| `GET /records/:id`                                      | a retained exemplar, or `404`                                                   |
| `GET /digest?since=<cursor>&limit=<n>`                  | change deltas — new/retired templates, anomalies, incidents, exemplar retention |
| `GET /search?q=<text>&limit=<n>`                        | templates ranked by semantic similarity                                         |
| `GET /diff?from=<t>&to=<t>`                             | templates added, removed and drifted in a window, plus the effective range      |
| `GET /incidents`                                        | correlated anomalies with a ranked root cause                                   |

`GET /digest` returns its own cursor and the bound's state with every page, so a consumer never has
to predict the cursor and can see that it fell behind rather than being silently truncated. The
`/diff` `drifted` bucket is keyed by flow **kind**, never by template: a template's embedding is
keyed by the fingerprint that identifies it, so it cannot move.

### The event contract

`POST /events` takes `{"events": [ … ]}` and answers `202` with per-event accounting; only a payload
that is not a batch of events is a `400`. An individual event that cannot be ingested is counted in
the result's `skipped`, never fatal to the batch. This is the language-neutral seam — **the contract
is JSON, so any language can implement an emitter**, and a non-TypeScript emitter has to produce
this and nothing more:

```jsonc
{
    "events": [
        {
            "id": "01J8Z9…", // required: locally minted record id
            "time": 1757758000123, // required: epoch ms
            "fingerprint": "9f3a2c1d…", // required: the emitter's hash-first identity
            "service": "checkout", // required
            "template": "[INFO][checkout][transfer prepared] …",
            "level": 30,
            "levelName": "info",
            "msg": "transfer prepared",
            "operation": "settlement",
            "refs": {"record": "01J8Z9…", "trace": "tr-1", "parent": "01J8Z8…"},
            "intent": {"name": "User_Transfer"},
            "flow": {
                "id": "01J8Z9…",
                "kind": "transfer.single",
                "step": "transfer",
                "index": 2,
                "status": "running",
            },
        },
    ],
}
```

Only `id`, `time`, `fingerprint` and `service` are required; everything else is absent-tolerant by
design, so an emitter that predates a field still ingests. `flow.kind` is what drift is observed
under, so an emitter that omits it is ingested and simply never observed for drift. The service does
no identity work: it keys the registry on the fingerprint the emitter computed.

## Development

```bash
node --run test        # tap, the whole package
node --run ci-test     # what CI runs (one job at a time)
node --run ci-lint     # tsc + cspell + eslint
```

There is no build step: `exports` point at the TypeScript sources and Node 24 strips the types. The
test suite includes a `strip-types` check that loads every shipping module in a bare-node child, so
a construct Node cannot strip fails there rather than at a consumer's import.

| Path                                                     | Contents                                                  |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `index.ts`                                               | public surface                                            |
| `docs/decisions.md`                                      | why the code is shaped as it is, and what was rejected    |
| `docs/open-items.md`                                     | what is still limited, and what needs a decision          |
| `docs/practices.md`                                      | how to change this package without repeating our mistakes |
| `src/level.ts`, `src/record.ts`, `src/refs.ts`           | levels, the record model, reference minting               |
| `src/normalize.ts`, `src/stack.ts`, `src/fingerprint.ts` | structural identity                                       |
| `src/context.ts`, `src/decide.ts`                        | intent, flow and step context, branch rationale           |
| `src/render.ts`, `src/writer.ts`, `src/logger.ts`        | rendering and the front door                              |
| `src/buffer.ts`, `src/cache.ts`, `src/redact.ts`         | withholding, the local cache, redaction                   |
| `src/service/`                                           | the cluster service                                       |
| `bin/`                                                   | `semantic-log-inspect`, `semantic-log-service`            |
| `flow/`                                                  | the two flows and their runner                            |

## Running it

The two flows are **demonstration fixtures for this library** — not an implementation of Mojaloop
and not a payment system. They are loosely based on Mojaloop's published
[FX](https://docs.mojaloop.io/product/features/fx.html) and
[Interscheme](https://docs.mojaloop.io/product/features/interscheme.html) features, and they exist
to produce realistic multi-service traffic (real HTTP, real failures, records retained per
participant) for the library to be watched and asserted against. The
[flow walkthrough](../../docs/blong/docs/patterns/semantic-log-flows.md) states exactly what they
keep, simplify, omit and add.

```bash
node flow/run.ts --flow single                       # a four-participant transfer, offline
node flow/run.ts --flow inter                        # the cross-border topology
node flow/run.ts --flow single --fault blockTransfers
node flow/run.ts --flow single --fault retries --count 40

node bin/semantic-log-service.ts                     # the cluster service
node flow/run.ts --flow single --service http://127.0.0.1:9455
```

The runner validates its arguments: an unknown `--flow` or `--fault` exits 2 with the usage line
rather than running something else quietly. `--service` is a second destination — the records are
retained locally either way.

| Flag              | Meaning                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `--flow`          | `single` (four participants) or `inter` (seven, across a cross-border proxy)      |
| `--fault`         | `blockTransfers`, `rewordLiquidity`, `stallTransfers`, `declineRate` or `retries` |
| `--count <n>`     | retries to drive, with `--fault retries`                                          |
| `--cache <dir>`   | where records are retained; a temporary directory when omitted                    |
| `--service <url>` | ship records to a running service **beside** the local cache                      |

See the [pattern guide](../../docs/blong/docs/patterns/semantic-log.md) for the participant
catalogue, the faults and the requirement mapping, and the
[flow walkthrough](../../docs/blong/docs/patterns/semantic-log-flows.md) for the sequence diagrams
annotated leg by leg against this code.
