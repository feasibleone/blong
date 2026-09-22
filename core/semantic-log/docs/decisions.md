<!-- cspell:ignore dereferenceability EACCES EADDRINUSE ELOOP errno Interledger kindless -->
<!-- cspell:ignore normativity ONNX Redeliveries unpushed -->

# semantic-log — decisions

Why this package's code is shaped the way it is: the decisions that are not visible in the code, the
reason for each, and the alternative that was rejected. Read this before "fixing" something that
looks odd — most oddities here are deliberate and were argued.

The implementation plans that produced this package were deleted once their content moved into the
**docs site** (`docs/blong/docs/{concepts,patterns,rationale}/semantic-log*.md`) and into this
folder. `Plan N Task M` below means "the Mth task of the Nth plan for this package"; task numbers
are history, not documents. Live gaps are in [open-items.md](./open-items.md); how to change this
package without repeating our mistakes is in [practices.md](./practices.md).

## Identity: what a template is, and when it is computed

**Identity is a hash of the masked structural form, never an embedding.** Two runs of one code path
must share one identifier however much their values differ, and the identifier must survive a
redeploy of unchanged code. Rejected: embedding-based identity — non-deterministic, and it would
make a log line's identity depend on a model.

**Redaction runs _before_ identity is minted.** The alternative (the obvious order — redact at the
output) leaves the secret in `template`, in `refs.template` and in `fingerprint`, because all three
are derived from `msg`/`err.message`; and a _hash_ of a withheld value is itself a leak (offline
dictionary attack, cross-record correlation). Deriving the whole identity family from what is
actually retained closes it by construction. Consequence to remember: two messages differing only in
a redacted segment now share a fingerprint.

**`mask` drops the trailing word boundary on numbers** (`\b\d+`, not `\b\d+\b`). `\b` needs a
non-word character after the digits, so the "obvious" pattern can never mask the `5000` in `5000ms`
— a quantity glued to its unit stayed in the identity. The leading boundary is kept, so `sha256` is
untouched.

**Record ids are minted with `monotonicFactory()`.** `ulidx`'s default `ulid()` is _not_ monotonic:
back-to-back calls in one millisecond produced 97 ordering failures in 200 pairs, which made the id
ordering assertion flaky rather than wrong. Monotonicity is what makes a reference usable as a sort
key and a cursor.

## Flow identity: two parts, three rules

A flow identity has **two** parts because it answers two different questions (owner ruling,
2026-09-13):

- **`flow.id`** — a caller-minted **ULID for one execution**. _Which run_ this is. Validated on
  `withFlow`: absent or malformed is caller misuse and **throws**.
- **`flow.kind`** — a caller-supplied **stable name for the flow as a process** (`transfer.single`).
  _Which recurring process_ it is, and **the key drift is observed under**. Required, for the same
  reason: a flow with no stable name has no drift key.

**The three rules around them.**

1. **The execution ULID is not the trace id.** A trace may span more than one flow, so `flow.id` and
   `refs.trace` are distinct values that relate without being equal. (An earlier draft reused the
   trace id as the flow id; it was wrong and is corrected everywhere.)
2. **Caller misuse throws; a surprise arriving on the wire is reported, never thrown.** The split is
   by _origin_: a local programming error should fail fast, but an unbalanced peer must not be able
   to break ingestion by sending an absent, malformed or inconsistent flow identity. The ingest
   counts it.
3. **Drift is a property of a flow, not of a template.** A template's embedding is keyed by the very
   fingerprint that identifies it, so its vector is _constant by construction_ and per-template
   drift can never fire. A flow's shape legitimately moves, so the drift key must outlive one
   execution — which is what `flow.kind` is for.

**Rejected:** a per-step `attempt` counter (it existed only to tell one run of a named flow from the
next, which the ULID answers by construction — the field was deleted, not fixed); deriving the drift
key from the entry template (a flow whose first step changes would silently leave drift); re-scoping
drift away entirely. Also rejected: tolerating a malformed flow id locally.

## Retention: every bound is explicit, and no loss is silent

**The registry is the only durable artifact**; digest, lineage, incidents and flow-drift history are
process-lifetime by design, and the service says so rather than being silently partial. A snapshot
that cannot be read does **not** stop the service: it is moved aside as `.corrupt` (kept, never
deleted) and the registry starts empty and loudly. A telemetry service that refuses to boot because
one cache file is truncated is worse than one that starts fresh and says so. Writes are atomic
(`rename` from a unique temp file) and serialised, so a slow save cannot land after a newer one.

**Retirement is a deliberate write, not a TTL.** `POST /templates/:ref/retire` stamps `retiredAt`
and publishes the digest delta; retiring does not delete, re-retiring is idempotent, and a later
`upsert` clears `retiredAt` (a template seen again is back). A `lastSeen` sweep was rejected:
retention is an explicit decision, not wall-clock expiry.

**Every bound counts what it drops:** `writeLimit` (queued cache writes), `withholdLimit` (ring
buffer), `sendLimit` (queued service sends), the digest's and incident buffer's 1000 entries,
`flowLimit` and its step cap, and the lineage index's `traceLimit`/`recordLimit`. Each surfaces its
loss (`writeDropped`, `withheldDropped`, `dropped()`, `evictions()`, `truncations()`, `skipped`) — a
bound that loses data silently is the failure class this package exists to prevent.

**The lineage index drops the _oldest_ record per trace, and that is load-bearing.** An anomaly is
raised while observing the event just ingested, so its record is the newest of its trace; dropping
the newest would discard the very record correlation needs and split one incident into two.
Consequence, pinned by a test: eviction truncates a chain, so `rootOf(child)` names the closest
_surviving_ ancestor rather than the true origin — degraded attribution, never a wrong one.

## Progressive disclosure: hold detail, release it on failure

`withhold(fields)` buffers on the **logger**; `error`/`fatal` releases the whole bag onto that
record, and `escalate()` releases it deliberately. Two consequences are deliberate:

- **The bag is redacted when it is withheld**, under both the presentation position
  (`fields.<name>`) and the record-root position, so the buffer never holds a value the same
  patterns would have withheld from a record. The first implementation redacted only the
  presentation position, which meant `withhold({err})` with `redact: ['err.message']` withheld
  _nothing_ and Task 10 would have persisted the plaintext.
- **`escalate()` keeps the detail buffered when `info` is filtered** by the level threshold, rather
  than draining it into a record that is never written. A later `error`/`fatal` still releases it.

**Because the bag lives on the logger, a long-lived participant must withhold on a request-scoped
`logger.child({})`.** Otherwise one execution's routing and liquidity detail rides _another_
execution's failure, under that execution's trace and flow id. The flows do this deliberately, and a
two-request test pins it. There is no per-request bag in the library, and that is the documented
semantic: a child gives you one.

## Detectors, correlation and the diff

**Three anomalies, reported separately** — novelty (a fingerprint never seen), rate-shift (a known
template at an anomalous rate against its own baseline) and drift (a known flow whose shape moved).
One similarity threshold conflates three causes that demand three different operator responses.

**`diagnostic.drifted` means "this template was the trigger of a drift observation".** It is derived
at read time from the retained anomalies (`kind === 'drift' && templateRef === entry.ref`), never
stored per template. Rejected: dropping the field, or a stored `alerts.driftAt` marker — a template
cannot drift, so a stored marker would be a mechanism that can never fire.

**The deploy diff's `drifted` bucket reads a bounded per-flow-kind drift history**, written when the
detector reports drift, and the history is a **required** argument of `deployDiff`. Rejected:
reading the bounded digest, which would silently under-report a release-window diff, and making the
argument optional (which reproduces the always-empty bucket the ruling was about).

**Incidents accumulate across batches and publish only what changed.** A cross-service incident is
by definition assembled from anomalies arriving in different batches, so batch-only correlation
could never produce one in production; and republishing every retained incident on every ingest
would be a delta storm in the stream the digest exists to keep readable.

**An unreadable numeric bound falls back, and the effective range is echoed.** Bare `Number(...)`
makes a rubbish `from`/`to` compare false, so the diff answers "nothing changed" — a silently wrong
answer rather than a visible fallback. Same rule as the digest's cursor.

## The service surface and the wire contract

**The ingest is absent-tolerant and the emitter never waits on it.** `POST /events` takes
`{events: […]}` and answers `202`; only a payload that is not a batch is a `400`; an individual
event that cannot be ingested is counted in `skipped` and logged. Anomalies and incidents travel on
the digest, not in the response, because the emitter must not depend on the service.

**Offline is a first-class mode.** Readable output, references and the local cache need no service;
the service sink is a **second** destination appended after the primary writer, never a replacement,
and a `null` primary writer silences the sinks too. The fan-out isolates a failing destination; the
sink is drained separately from the write tracker, so a caller shutting down must flush both.

**The public contract uses generic vocabulary.** No framework-specific property name, URI scheme or
tool name appears in the requirements — the library is standalone, so the spec cannot be written in
one consumer's dialect.

**The inspector refuses a missing cache directory rather than creating it.** `openCache` would
`mkdir` it, so a typo in `--cache` would resolve every reference as unknown against a store it had
just invented. Exit codes are part of the contract (0 resolved, 1 unknown, 2 not retained, 3 usage),
and the store genuinely cannot distinguish pruned from never-existed — so that distinction is
asserted by `--expect-retained`, not guessed from an id's shape or age.

## Rendering and references

**One greppable header line, detail indented beneath it, never a raw object dump.** Detail labels
use _two_ spaces of padding, which the acceptance regexes required; the header is sanitised of
control characters so no field value can forge a line or inject a terminal escape.

**The human line is compact by default; the identity details are opt-in.** A production reader is a
Kubernetes pod whose identity is already known from where the line came, so the service name, the
version and the base fields (`pid`, `hostname`) are printed only when `details` is asked for — the
inspector asks, the emitter does not. The service and the version stay on every record (JSON mode,
the retained store, the cluster service), so §5.1's "Base fields (pid, hostname, service, version)"
still holds of the record; only the pod-level pair is not collected at all unless it is asked for.
Rejected: printing the service always, which puts a token nobody reads on every line of every pod's
log. One exception: a line salvaged after a render failure always names the service, because there
the reader does _not_ know which process produced it.

**References are minted locally at emit time** — `r` (record), `t` (template), `x` (trace) and `p`
(the causal parent, rendered as a bare id) — so an offline process still produces usable ones. Ids
are percent-encoded before rendering, because a trace id is untrusted text and, left raw, an id
could close the reference group and forge a second reference.

**A payload reference is minted only when something retains the payload.** A reference to a payload
nothing holds is a dead link — worse than the long line it replaces — so the decision to retain and
the decision to render a reference are taken together, and the value itself stays in `fields` (this
is an _inline_ payload reference, not a claim check). OSC 8 hyperlinks are available but
deliberately unused in the default rendering, which must stay escape-free.

## Package shape and dependencies

**No build step: Node strips types.** That makes the _runtime_ the authority, not `tsc` or `tap` —
which is why `test/strip-types.test.ts` loads the package root and every shipping module in a
bare-node child. Rejected: checking a curated list of modules (the list omitted the offender, a
parameter property written across two lines).

**The embedding provider is pluggable, and the three providers are not interchangeable.** Offline
(deterministic, no network — the default, and what CI uses), local (an optional, **undeclared**
package that downloads a model on first use) and remote (any OpenAI-compatible endpoint). A vector
is only comparable with vectors from the provider that produced it, so changing provider starts a
registry whose stored centroids it cannot compare against. Selecting `local` without the package
installed fails with a named, actionable error rather than an opaque module-resolution crash.

**The two flows are demonstration fixtures, not an implementation of Mojaloop.** They are loosely
based on its published FX and inter-scheme features, and they simplify the protocol deliberately so
a run produces realistic multi-service traffic to watch and assert against. The differences are
tabulated in the docs-site flow walkthrough.

## Where the requirements live

The v1 requirements (R1–R21), the capability-parity matrix's trade-offs, the vocabulary and the
user-facing open questions are in the **docs site**: `docs/blong/docs/rationale/semantic-log.md`.
The parity matrix's durable form is the self-checking audit `test/parity.test.ts`, and the
requirement→demonstration mapping is `test/flow/coverage.test.ts` — deliberately not restated here,
because a second copy would rot.

## Calls, diagrams and search: the leg-identity decisions

**A leg is a library concept, not a fixture concept.** `bindLeg`, `bindInboundLeg`, `currentLeg`,
`isLegId`, `isLegSeq`, `isServiceName`, `identityHeaders` and `readIdentities` are exported from the
package, and the propagation contract lives in `src/propagation.ts` — the fixture **imports** it.
Rejected: the original shape, in which `hop()` owned the header names and the ids were arguments to
a function in `flow/`. A convention an application can only use by adopting a demo is a demo.

**The leg sits inside `flow`, not beside it.** It is a position within one execution (like `step`
and `index`), so it is meaningless outside a flow and belongs in the same wire object. Rejected: a
top-level dimension, and `refs` — a ref is locally minted and CLI-resolvable, and a declared leg is
neither.

**The id's grammar is enforced, its taxonomy is not.** `[A-Za-z0-9]`-led, with `.`, `-`, `_` inside
and `/` for a forwarded hop (case preserved: `hubA.quote.proxy` names the participant the source
names, and `db/gateway.bundle.find` names the wire method the receiver strips back to). A violation
**throws** where the caller declares it — caller misuse fails fast — while a value arriving on the
wire is read as _absent_, because a peer must not be able to 500 a batch (D3's split). The naming
convention (`<participant>.<phase>.<object>`, or `<namespace>/<participant>.<phase>.<object>` when a
hop is forwarded) is documented and not enforced: a taxonomy rule would reject ids that are fine and
cannot check the thing that matters, which the honesty checks do instead.

**The caller is an identity, not a prefix of the id.** Ruled 2026-09-22, on the owner's reading of a
diagram drawn of the gateway realm: the id is what a diagram **labels the arrow with**, and a label
that began with the caller repeated what the arrow's own ends already said —
`public.gateway.bundle.find` between `public` and `gateway` — while making every label longer than
the arrow it sat on. So the leg is the **method** the call reaches its callee with, and the unit
that made it travels beside the method in its own field of the identity (`from`, with `to` naming
the receiver it aimed at and `seq` its position). Nothing is derived from the id any more:
`callerOfLeg` is gone, an observation whose identity carries no caller contributes **no edge** (the
source of an arrow is not something to infer, and the process that wrote the record names the
deployment), and the pairing of a call with its answer is keyed by `(method, caller)` rather than by
the method alone — two units may call the same method in one execution, and those are two calls.
Rejected: keeping the caller in the id and hiding it in the diagram (the data would still be wrong
for every other reader), and reading the caller off the id as a fallback (that is the derivation
this ruling removed, and D-210 already says the writer is never consulted).

**The caller declares the receiver.** `legTo` is on the caller's records and nowhere else. That is
what keeps an **attempt** on the record when nothing answers: a receiver that is missing, failing or
wired to the wrong address still appears, and its silence costs only the `answered` count. Rejected:
pairing the two ends by arrival order (a coin flip between processes — measured, 7 of 14 legs tied
at a millisecond), and pairing by time (same problem, plus a shared clock nobody has).

**Order is a counter path, not a clock.** A receiver numbers its own calls as children of the
position it was handed, so `1.1.1` is the first call made while answering `1.1` and the paths form a
depth-first walk of the execution — which is what a sequence diagram is drawn in. No coordinator is
involved and no timestamp is drawn anywhere, which is also why the generated artifact can be
compared byte for byte.

**A finished execution still accepts records.** Superseded an earlier rule of this package's own
making ("a spent execution takes no further calls"). The generated artifact proved it wrong on its
first real run: the payer's sink flushes before the hub's, so the payer's terminal
`transfer complete` arrived first and the hub's last four records were refused — losing the hub's
declaration of `hub.transfer.deliver`, a whole edge of the observed flow. Arrival order between
processes is not emission order; the terminal status is recorded as `closed` and never refuses an
observation. Redeliveries are still deduplicated by event id, and retention is still bounded by the
cap.

**Diagrams are drawn from observations, and published as a generated artifact.** The diagrams and
tables in the docs page are generated from a real run of the fixtures (`docs/observed-flows.md`,
regenerated with `SEMANTIC_LOG_UPDATE_DIAGRAMS=1`) and compared verbatim by a test — including the
blocks embedded in the docs page, which the same run rewrites between markers. Rejected: keeping
hand-written diagrams (they drift silently — the "Leg by leg" tables were the wrong answer to a
reasonable request: what a reader needs is not a legend but a label that can be found in the
source), and drawing from a manifest (an artefact maintained by hand, which is the same failure with
a different file name).

**Every label is sanitised on the way into mermaid.** Each string arrives from a process this one
does not control; `;` is a statement separator there (the defect shipped once) and a service name
carrying `->>` would otherwise become an arrow. Participant names are folded to `[A-Za-z0-9_.-]` and
two names that collapse to one are numbered apart rather than merged — the renderer is total, so a
model it is handed can never produce an undeclared participant or a second statement.

**A snapshot records which provider wrote it.** Vectors are only comparable within one provider at
one width, so `version: 2` carries `{kind, model, dimension}` plus the per-kind union of observed
calls (the one diagram surface a restart cannot re-derive). A mismatch is quarantined like any other
unusable snapshot, under a suffix naming the reason: `.corrupt`, `.unsupported` (an older format) or
`.provider` — calling the last two `corrupt` would be a lie the operator then has to disprove.
Rejected: restoring and hoping (the numbers parse and every answer is nonsense).

**Records are embedded when they are retained, not when they arrive.** The vector is keyed by the
record's own id under a `record:` namespace — the fingerprint key would collapse every exemplar of a
template onto the one vector that template has — and only for records the store will keep, so the
cost stays per template times the retention bound rather than per event. A record whose vector is
missing is left out of a search rather than embedded during the query: the alternative costs one
provider call per candidate per query. Rejected: embedding every record (cost scales with traffic,
the one thing R3 exists to prevent).
