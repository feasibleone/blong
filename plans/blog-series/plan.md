# B2. See your architecture while it runs

**Back-date** 2026-02-10. **Priority** P2.

**Pitch.** A live graph of realms, layers, handlers, adapters and orchestrators, drawn from the
running process. Click a node to see its configuration, handlers, logs and metrics.

**Must include.** That the graph is read from the runtime registry rather than from a static
analysis, so what you see is what is wired; the interactive surface (zoom, pan, inspect); how it
answers the question "is this layer actually loaded in this intent?" — which is the hardest question
in a framework whose topology is a CLI argument.

**Where to look.** `tools/blong-graph/README.md` (with a screenshot URL), commit `115c718c` (#24);
`docs/blong/docs/concepts/architecture.md` and `docs/blong/docs/concepts/dependencies.md` for the
concepts it visualises; `docs/blong/draw/architecture.drawio`, `realm.drawio` for static diagrams.

**Docs status.** Missing — `blong-graph` has no page under `docs/blong/docs/`. Write a short
`patterns/graph.md` (or a "Runtime introspection" section in `concepts/architecture.md`) before this
post, otherwise the post's only link is a README.

**Visual.** Screenshot of the graph; optionally a before/after with the entry for one intent.

**Verification (2026-09-27) — still postponed.** The data path is real and was exercised: with the
`cli` intent, `graph.graph.get` returns 58 nodes built from `Registry.describe()`, and adding
`integration` to the intents adds exactly the `test` layer (60 → 64 nodes), which is the "is this
layer loaded?" answer the article is about. What is missing is the served path: no suite in this
checkout reaches a listening gateway (`/rpc` and `/api/sys/*` answer 404 after every realm logs
`adapter.ready` — the same gap as `T-072` in `core/blong-kukum`), `blong-graph` is not a child of
any suite here, and its Playwright spec cannot run as committed. The README also over-claims: the
node panel shows type, label and name, not configuration, logs, metrics or handlers. So the post
waits until a suite serves `/rpc/graph/graph/get` and a screenshot can be taken from the real
viewer, and the page `patterns/graph.md` goes with it.
