<!-- cspell:ignore EADDRINUSE huggingface kindless ONNX SIGSEGV untraced -->

# semantic-log — open items

What is still unfinished, still limited, or waiting on a decision. Grouped by what a reader has to
_do_ about it: decide, live with, harden, or hand to the owner. Resolved decisions are not listed
here — their reasoning is in [decisions.md](./decisions.md) — and the user-facing questions
(retention bounds, cache partitioning, multi-tenancy, embedding model) are in the docs site under
`docs/blong/docs/rationale/semantic-log.md` → _Open questions_.

## Needs a decision

**R19's HTTP half.** R19 asks for record _and_ inline-payload references to resolve through both the
CLI and an HTTP API. The CLI resolves both; the service cannot, because it has **no payload store**
— a payload lives in the emitter's local cache and the wire carries no payload body, so there is
nothing for a route to serve. Either ship payload bodies to the service (a real change to the
transport and the wire type, with its own retention question) or re-scope R19's acceptance to the
CLI. The §5.1 parity row's `unmet` states exactly this rather than claiming the kind does not exist.

**The detector cold baseline.** The shipped rate detector scores a baseline of five _completed_
60-second windows, so a service started with the defaults reports no rate-shift for its first five
minutes — precisely when an operator is watching a new deployment. Decide whether the window is
meant to be deployment-tuned (in which case the README should say so) or whether a cold baseline
should be reported as _no baseline yet_ rather than silence. Not fixed here: changing a detector's
window semantics is a design decision, not a defect repair. (The tests demonstrate rate-shift by
passing a tuned `DetectorSuite` to `createApp`, which is why the option exists.)

**A leg sequence as a drift shape.** Drift compares the _template-ref_ sequence of an execution
(`FlowShapes`), and the calls an execution made are now a second observed sequence — retained per
execution by the flow ledger and published with the union. A reworded message already fires drift
(that is fault F3's whole job), so keying drift on legs as well would have to be founded on a
different case: a call **added, removed or reordered** while the templates stay the same. Decide
whether that is worth a second series and what it would report; until then the leg sequence is data
(the diagrams read it) rather than a detector input.

## Known limitations

**A drift anomaly cannot be attributed to a trace in production.** Drift is keyed by the flow
**kind**, and `Anomaly` carries no trace, so a drift anomaly is grouped under `untraced:<flow.kind>`
— one incident per kind rather than per trace, which is not what cross-service correlation intends.
Fixing it means putting the triggering event's trace (or the event itself) on the anomaly: a
detector/ingest surface change, not a correlation one. The correlation tests do not show it because
they build the anomaly they need.

**Incident and anomaly retention are bounded separately, and eviction does not retract.** The
anomaly buffer is a count bound (1000) and `IncidentStore.list()` keeps every incident ever opened,
so an incident outlives the anomalies that produced it. `FlowDriftHistory`'s kind set is a plain map
with no cap at all — accepted on the assumption that `kind` is a stable process name and callers
name few processes. Both are bounded in practice, neither by construction.

**`correlate` scans every retained trace per anomaly** (`traceIds()` × `trace()`), so a full anomaly
buffer against a full lineage index is O(anomalies × traces × records) on every ingest that raises
one. Accepted at the current scale; a fingerprint→traces index is the fix if throughput ever
matters.

**The flow-drift history is in-memory only.** `persistTo` deliberately scopes itself to the template
registry, so a restart loses every drift window — and this surface exists to answer questions over
windows of days. The history is injectable, so a loader could be wired later.

**`logger.flush()` does not drain sinks.** It drains the cache write tracker; a `fatal` writes to
stdout and exits synchronously, so a queued service send is dropped. Inherent to fire-and-forget — a
shutdown hook would be needed if delivering a `fatal` to the service ever matters. (The fixtures
flush the sink explicitly before closing, which is why their last record survives.)

**The lineage index's retention degrades attribution.** Eviction truncates a chain, so
`rootOf(child)` names the closest surviving ancestor rather than the true origin. Disclosed in the
class doc and pinned by a test; there is no way to make a bounded index answer about an evicted
record.

**`FlowState.status` offers `'stalled'` and nothing writes it.** A stalled flow is reported as the
last step it reached with `status: 'running'`, which is observable and is what the stall fault
asserts; the extra status value is unreachable. Either write it or remove it. Relatedly, the stall
fault answers `504` after a short sleep rather than hanging — `hop` has no timeout or `AbortSignal`,
so a true hang is not representable in the fixture.

**A silenced record is still remembered as the next record's parent.** `writer === null` silences
output, but the id is remembered before the write, so the following line renders a `p=` pointing at
a record no destination holds. The lineage index degrades safely, so this is a dead link rather than
corruption.

**The parent memory is per async scope, not per request.** Two unrelated records emitted inside one
shared context (no `withFlow`/`withIntent` boundary) are chained as cause and effect, asserting a
causation that does not exist — strictly worse than an absent link for a consumer that trusts
`parent`. Nothing in `record.ts` or `context.ts` warns about it.

## Test gaps and hardening

- **The fixture's log calls are asserted at only some of the sites the nesting fix touched.** A
  deleted or re-nested call at `fxp.ts` (`rate published`), `hub.ts` (`liquidity reserved`/the
  reworded variant), `payee.ts` (`party profile returned`, `quote signed`) or `payer.ts`
  (`transfer complete`, `submitting transfer`) would go unnoticed. Being able to fix a defect class
  is not the same as pinning it.
- **`participant.test.ts`'s "closing a participant releases the port and the cache" asserts only the
  port** — the cache half of its own title is unverified.
- **`hub.ts` does not check the payee's `/quotes` status.** Unreachable today (the payee's `/quotes`
  can only answer 200), but it is an absent guard exactly where the hub's own doc says a refusal
  must not be papered over.
- **No test passes `options.level`**, so the left-hand sides of those fallbacks are never exercised.
  The coverage gate cannot see an untaken `??`/`?.` side (see [practices.md](./practices.md)), so
  this needs an explicit assertion rather than a green run.

## Owner actions

- **`plans/log-embed/` is still on disk** (restored for a final review, untracked). Nothing in
  `core/`, `docs/` or the README references it any more, so it can be deleted again without loss.
- **The plan-execution history** (task briefs, reports, mutation logs) lived in gitignored
  `.superpowers/`, and is not recoverable from a fresh clone. That is process history rather than
  product documentation, and the decisions it produced are recorded here — but if it should be
  durable, `.superpowers/` has to stop being ignored.
- **The intermittent `tap` SIGSEGV flake is recorded in the repository ledger**
  (`.github/memory/todo.md`), because it affects every tap package, not only this one. Its signature
  is a test count _lower than the suite's_ — re-run before investigating.

## Deferred deliberately

**The inspector's `index` and `search` verbs.** D22/D27 planned `index --cache <dir>` writing a
`<dir>/vectors.jsonl` sidecar and `search --query <text> [--service|--cache]` reading it, so a
developer could rank their own records without a running service. Semantic search itself is built
and tested — `GET /search` ranks templates **and** retained records, and the real-model test proves
a paraphrase finds the record it means — so this is the _offline_ half of that requirement, not the
requirement. What is missing is the sidecar: its format, its staleness rule (a record written after
the index must be reported rather than silently missing) and the exit codes for "nothing indexed".
Deferred because it is a second storage surface with its own lifecycle, and the service route
already answers the question the feature exists to answer.
