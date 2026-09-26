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
2026-09-13T10:11:12.345Z info  transfer prepared [semlog://t/9f3a2c1d4e5f]
2026-09-13T10:11:12.346Z error settlement failed [semlog://r/01J8ZA… semlog://t/1b2c3d4e5f60]
  error  Error: connection timeout
    at Socket.handleTimeout (/app/src/net/pool.ts:42:12)
```

The shape link (`semlog://t/<shape>`) is the one every record carries: the store keeps one entry per
**shape** — one per kind of record, not one per occurrence — so that link resolves to the newest
occurrence of that kind and says how many times it happened. The record link (`semlog://r/<id>`) is
printed when folding a record into its shape would hide something: it withheld a payload, or it
carries an error.

That is the compact default. Pass `details: true` to print the service name, the version and the
base fields (`pid`, `hostname`) on the header as well — the inspector asks for them, a pod's log
does not, because whoever reads it already knows which pod it came from.

Nothing needs configuring for this to work — no service, no transport, no schema.

## Configuration

| Option          | Default             | Meaning                                                                                                                            |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `service`       | _required_          | service name; on every record, and on the line with details                                                                        |
| `level`         | `info`              | threshold; `logger.setLevel()` changes it at run time                                                                              |
| `version`       | the package version | on the record; on the line when asked                                                                                              |
| `context`       | —                   | a context label (component or module) for the whole logger                                                                         |
| `bindings`      | `{}`                | fields merged into every record; inherited by `child()`                                                                            |
| `format`        | `human`             | `human` or `json` (one JSON object per record)                                                                                     |
| `color`         | `false`             | ANSI colour in human format. Opt-in: nothing inspects a TTY, so a piped or captured run gets plain text unless colour is asked for |
| `writer`        | `stdoutWriter`      | the primary destination; `setWriter(null)` silences it process-wide                                                                |
| `sinks`         | `[]`                | extra destinations, fanned out after the primary (`createLogger({sinks: [createServiceWriter({url})]})`)                           |
| `cache`         | —                   | retains records on disk so a printed reference can be resolved later                                                               |
| `payloads`      | —                   | retains large field values, which then render as a `semlog://p/…` reference                                                        |
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
  [semlog://t/9f3a2c1d4e5f semlog://x/tr-1 p=01J8Z8…]
```

Every part that is a link is a URI and nothing else: the kind is a single letter in the path, so a
label in front of it (`r=…`) would repeat what the URI already says and would stop an editor
recognising it as a clickable link. `r` is a record, `t` a shape (the template identity), `x` the
trace, `p` the causal parent. The parent is the one bare id, because it is a relation within the
record's own references rather than a reference of its own. All of the links resolve on demand; see
[Resolving a reference](#resolving-a-reference).

A record may carry a `progress` facet too: the branch chain it was emitted inside (`regions`) and
the points announced in its scope (`points`). Both ride the next emitted record, the way a
`decision` does, and both are reduced to **names** on the wire, so identity never depends on the
data a point carried ([R26, R27](../../docs/blong/docs/rationale/semantic-log.md)).

## Resolving a reference

The inspector reads exactly **one file** per lookup; it never enumerates the cache to find a record.
Flags may appear before or after the reference.

```bash
node bin/semantic-log-inspect.ts --cache <dir> <reference|id>
node bin/semantic-log-inspect.ts --cache <dir> --json <reference|id>            # machine-readable
node bin/semantic-log-inspect.ts --cache <dir> --expect-retained <reference|id>
node bin/semantic-log-inspect.ts diagram --cache <dir> <flow-id|flow-kind>     # what a run did
```

| Flag                | Effect                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `--cache <dir>`     | the cache root; `~/.semantic-log/cache` when omitted                                       |
| `--json`            | the machine-readable rendering instead of the readable one                                 |
| `--expect-retained` | the caller states the reference was once live, so an absent entry is _pruned_, not unknown |

### `diagram` — what a run did, offline

`diagram` draws the observed shape of one execution (a ULID) or one flow kind, from the local store
alone — no service, no network. It reads what the store has that the service never sees: the branch
rationale and the **withheld categories** are in the records here and nowhere else. A **progress
point** is drawn as a `Note over <participant>:` line above the call it was reported in, and a
**branch** as an `alt`/`else` block around the calls made inside it
([R26, R27](../../docs/blong/docs/rationale/semantic-log.md)).

This is the one verb that **enumerates** the store, because a picture of a run needs every record of
it. That scan is not a second lookup path — `cache.get` still fetches each record, and nothing is
written or pruned — and the module's own contract says so rather than leaving a reader to wonder why
R21's "never enumerates" does not hold here.

The reference's own kind chooses the store: `semlog://r/<id>` and `semlog://t/<shape>` read the record
half — a record kept under its own id, and a shape, which is what the store holds one of per kind of
record — and `semlog://p/<id>` the payload half. A bare id is read as a record. The word spellings
(`semlog://record/…`, `semlog://payload/…`) are accepted too, so a reference copied from an older log
still resolves. Exit codes say
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

## Naming a call: leg identity and propagation

A **leg** is one call: the method the call reaches its callee with, the unit that made it, the
receiver that unit expects, and the position the call holds in its execution. It is what turns a log
line into an answer to "which call was this?", and it is a **library** concept — `bindLeg`,
`bindInboundLeg`, `currentLeg` and `identityHeaders` are exported from the package, so an
application uses them without adopting the demo fixture in `flow/`.

```ts
import {bindLeg, identityHeaders} from '@feasibleone/semantic-log';

// The caller declares the method, itself and the receiver it expects, before it calls.
await bindLeg({id: 'transfer.submit', from: 'payer', to: 'hub'}, async () => {
    logger.info('submitting transfer', {req: {operation: 'POST', target: '/transfers'}});
    // Every record logged inside this scope now carries the leg. `legSeq` is assigned for you:
    // the outermost call in an execution is `1`, and a call made while answering `2.2` is `2.2.1`.
    return fetch(url, {headers: identityHeaders(request.headers)});
});
```

The receiving side adopts what it was handed, so **both ends** of a call name the same leg:

```ts
const leg = legFrom(request); // validated: a malformed wire value reads as no leg, never a throw
await participant.run(traceId, flowId, leg, async () => {
    logger.info('transfer prepare started'); // carries the caller's leg, its method and its caller
});
```

Two rules make the legs worth trusting:

- **Both ends log.** The caller logs the request inside the leg it declared, and the receiver logs a
  receipt under the leg it adopted. One end alone is still evidence — the caller's declaration is
  what puts the attempt on the diagram — but the pair is what makes an edge _fact_.
- **A leg is the method, and it is one call.** The id is the method the callee is addressed by,
  declared where the call is made — never in a manifest — and a call site that logs five records
  about one call is one call. The unit that made the call is a field of its own (`from`), because a
  diagram draws the two ends from the identity and labels the arrow with the method: repeating the
  caller in the label said what its own arrow already said. Reusing a method for two different calls
  in one execution is two calls from two units, and the ledger keys them apart by `(method, caller)`
  rather than merging them into one arrow.

### The observed shape, published

The service draws both diagrams itself (`GET /flows/:reference/diagram`) from what it **observed**,
and the fixture's two schemes are published as generated blocks — diagram and table — in
[`docs/observed-flows.md`](docs/observed-flows.md) and in the docs site's
[flow page](../../docs/blong/docs/patterns/semantic-log-flows.md). Every arrow is labelled with the
leg id and every row names the **file and line** that declares it, which is the cross-reference the
ids exist for: a picture of a run that leads to the code that made it.

Regenerate the artifact and the docs page's blocks (the prose around them is never touched):

```bash
SEMANTIC_LOG_UPDATE_DIAGRAMS=1 ./node_modules/.bin/tap test/flow/observedFlows.test.ts
```

Three checks keep that claim honest, and each was **observed failing** before it was trusted: every
id a run observed is a literal in the code, every literal is observed by some run (or exempt with a
stated reason), and one execution declares each call to exactly one receiver.

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
| `--persist <file>`  | —           | JSON snapshot of the **template registry and the calls observed per flow kind**, restored on start and saved with every accepted batch                                                                                                               |
| `--embedding`       | `offline`   | `offline` (deterministic, no network, no model download — the default, and what CI uses), `local` (an in-process transformer model from an optional package, loaded lazily and downloaded on first use) or `remote` (any OpenAI-compatible endpoint) |
| `--embedding-url`   | —           | endpoint for `--embedding remote`                                                                                                                                                                                                                    |
| `--embedding-model` | —           | model name for `--embedding remote`                                                                                                                                                                                                                  |

`local` needs its optional provider package installed. It is declared as an **optional dependency**
(`@huggingface/transformers`), so `rush update` installs it, and a machine without it is a supported
state rather than a broken one: a load failure is reported as a named error instead of an opaque
module-resolution crash. `SEMANTIC_LOG_EMBEDDING=local` asks for it without a flag, which is how a
dev session is switched over while the shipped default stays deterministic — every ranking assertion
in the test suite is written against the offline provider, because a ranking written against a
downloaded model is an assertion about a machine. The real model is asserted where it is real:
`SEMANTIC_LOG_LOCAL_MODEL=1 ./node_modules/.bin/tap test/local-model.test.ts`, which also proves the
thing the hash provider cannot do (a paraphrase finding the record it means).

**Embedding vectors are not interchangeable across providers**: the default dimension is 64 for
`offline`, 384 for `local` and 1536 for `remote`, and a centroid is only comparable with vectors
from the provider that produced it. A snapshot therefore records **which provider wrote it**, and a
snapshot from another provider — or from an older version of the format — is moved aside rather than
restored: the numbers would parse, and every answer would be nonsense.

**Two durable artifacts, not one.** The registry and the per-kind union of observed calls are
persisted; the digest, causal lineage, incident store, flow-drift history and the per-execution flow
ring are process-lifetime surfaces and deliberately are not. A snapshot the service cannot use does
not stop it: it is moved aside and the service starts empty and says so, rather than refusing to
serve telemetry over one bad file. The suffix names the reason, so the operator is not left to guess
— `.corrupt` (unreadable), `.unsupported` (an older format) or `.provider` (another embedding
provider).

| Route                                                   | Returns                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /events`                                          | accepts a batch, `202`; the emitter never waits on it                                                          |
| `GET /health`                                           | liveness                                                                                                       |
| `GET /templates`                                        | the registry — refs, counts, first/last seen, alerts, intents                                                  |
| `GET /templates/:ref`                                   | one entry; `404` when unknown                                                                                  |
| `GET /templates/:ref?facet=ops\|diagnostic\|compliance` | a read-time projection; an unknown facet is a `400`                                                            |
| `POST /templates/:ref/retire`                           | stamps `retiredAt` (retiring does not delete) and publishes the delta                                          |
| `GET /records/:id`                                      | a retained exemplar, or `404`                                                                                  |
| `GET /digest?since=<cursor>&limit=<n>`                  | change deltas — new/retired templates, anomalies, incidents, exemplar retention                                |
| `GET /search?q=<text>&limit=<n>`                        | templates **and retained records** ranked by semantic similarity, each with a `kind`                           |
| `GET /diff?from=<t>&to=<t>`                             | templates added, removed and drifted in a window, plus the effective range                                     |
| `GET /incidents`                                        | correlated anomalies with a ranked root cause                                                                  |
| `GET /flows`                                            | what was observed per flow kind, and the executions retained in detail                                         |
| `GET /flows/:reference/diagram`                         | a mermaid sequence diagram — of a flow **kind** (its reference is not a ULID) or of one **execution** (a ULID) |

### What is searchable, and what is kept

Semantic search ranks two candidate sets, and they do not live in the same place:

| Candidates                                                              | Vector                                                                                           | Kept where                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **templates** — one per distinct fingerprint                            | embedded from the structural signature, cached under the fingerprint                             | the registry: **persisted**, restored on start      |
| **retained records** — at most `exemplarLimit` per template (default 5) | embedded from the record's own text (message, operation, service, signature) under `record:<id>` | the exemplar store: **process-lifetime**, in memory |

A query is embedded once under `query:<text>` and both sets are merged on cosine similarity, each
result carrying a `kind`. Two consequences follow, and both are deliberate:

- **There is no historic database of records to search.** Records are retained as _evidence_, not as
  a corpus: the emitter keeps a bounded local ring (`~/.semantic-log/cache`, R21), the service keeps
  the first few records of each template in memory, and a restart brings back the registry and the
  per-kind union of observed calls — not the records. So record-level search answers "which of the
  occurrences I am currently holding looks like this", over a set bounded by templates ×
  `exemplarLimit`, and a service that has just restarted will not find a record it observed
  yesterday. Searching a _history_ means having a history: ship the records to storage you own and
  index them there.
- **The bound is the cost model.** An embedding per record would make the provider's work scale with
  traffic, which is the one thing R3/SC3 forbids; the per-template bound is what keeps it finite.

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
                "leg": "payer.transfer.submit", // the call this record belongs to (R22)
                "legTo": "hub", // the participant the caller declared — caller's records only
                "legSeq": "3", // where the call sits in the execution: 2.2.1 is the first call made answering 2.2
            },
        },
    ],
}
```

Only `id`, `time`, `fingerprint` and `service` are required; everything else is absent-tolerant by
design, so an emitter that predates a field still ingests. `flow.kind` is what drift is observed
under, so an emitter that omits it is ingested and simply never observed for drift. The service does
no identity work: it keys the registry on the fingerprint the emitter computed.

`flow.leg`, `flow.legTo` and `flow.legSeq` are the call the record belongs to. `leg` is an id the
**source code declares**, `legTo` is the participant the caller expects to answer, and `legSeq` is
the call's position in the execution. See below for the discipline that makes them worth carrying.

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
