# @feasibleone/blong-realm

The framework realm that renders what the semantic log service has observed: the flows and their
sequence diagrams, the templates that messages collapse into, free-text search over what was seen,
the recent change digest, and the incidents assembled from several services' records.

Six reads, five pages, one service behind them all:

- `blong.flow.find` — **Flows**: what was observed, by kind and by execution.
- `blong.flow.get` — **Flows**: one execution's diagram, as mermaid text.
- `blong.template.find` — **Templates**: the messages learned, keyed by fingerprint.
- `blong.search.find` — **Search**: free text over everything observed.
- `blong.digest.get` — **Digest**: what changed recently.
- `blong.incident.find` — **Incidents**: what broke, merged across the services that saw it.

The data is not this realm's: it belongs to the service described in
[`core/semantic-log`](../semantic-log/README.md). The realm is a reader — an HTTP adapter to that
service, a dispatch orchestrator that owns the `blong` namespace, one route declaration per method,
and a page per read.

## Running it

```bash
node --run blong -- microservice integration dev playwright   # server (gateway on 9046 in CI)
node --run dev -- --port 9146 --force                         # the pages, under /s/
node --run playwright                                         # the page specs
```

`node --run test` runs the server-side tap flow; the Playwright suite is what exercises the whole
path — a real session, the gateway's authorization, the realm's read, the service, and the page that
shows the answer.

## Wiring rules this realm learned the hard way

- **A method is only routed when the `gateway` layer declares it.** One `validation` handler per
  method under `gateway/blong/` registers the RPC route; without it the gateway answers
  `-32000 Not Found` while in-process calls still resolve, because those never touch the gateway's
  routes. Those files are also the only place the six methods are stated: the adapter holds
  conversions (a `<method>RequestSend` per read and one `responseReceive`), so no handler names a
  method any more.
- **A capability lists the method names that are called, dotted.** A grant of `blongFlowFind`
  matches nothing: `gateway.authorize` compares `blong.flow.find`. The symptom is a page-level error
  dialog on every page.
- **The emitter's vocabulary is attached, never imported.** `semantic-log`'s ambient context is
  `AsyncLocalStorage`-based and therefore server-only; the shared realm machinery is loaded by the
  browser too, so `loadServer.ts` attaches the vocabulary and `semanticContext.ts` degrades to "no
  identity" without it.

## Reading the pages in a spec

`openPages` from `@feasibleone/blong-browser/playwright/pages` states a realm's pages as a list. Two
things are worth knowing before writing one:

- **Pin what you capture.** A page whose content grows every run (a change stream, a list of what
  has been observed so far) is only worth capturing once its rows are pinned — `searchText` types
  into the page's filter, the way `browseModel`'s `searchText` does.
- **Mask what cannot repeat.** An execution id is minted per execution and a timestamp is a wall
  clock; `mask` hides those cells while the rest of the page stays visible. Masking is honest there,
  and pinning is not.

A DataTable renders its empty state as a row, so `tbody tr` matches "Nothing observed yet" as
readily as a row of data. Recognise a data row by a cell it renders (this realm's pages carry
`data-testid` on the volatile cells for exactly this reason) rather than by excluding the empty
state's class or text.

## Regenerate diagrams

The documentation artifact, `docs/observedFlows.md`, is the mermaid text of one real execution of
this realm's own read — the newest one of that kind — captured by the diagram spec in
`test/blong.play.ts`, written only when `BLONG_REGENERATE_DIAGRAMS=1` is set and byte-compared
otherwise:

```bash
BLONG_REGENERATE_DIAGRAMS=1 node --run playwright -- test/blong.play.ts --update-snapshots
```

Both ends of its arrow are read off the call, not off the deployment: the caller is the logical
unit the leg id names — `gateway`, the public surface that received the request — and the receiver
is the namespace it was aimed at. Naming either end after the process that happened to write the
record would draw a monolith as a single participant, which is a property of how a suite is split
rather than of what happened. A crossed arrow (`--x`) is the other honest outcome: a call was
declared and nothing answered it.
