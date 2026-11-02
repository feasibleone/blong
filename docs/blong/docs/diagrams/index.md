# Diagrams

The framework's structure and its delivery path, drawn as diagrams that can be panned, zoomed and
followed node by node rather than as pictures of diagrams. Each one lives on the page that explains
it; this page is the list.

- [Blong deployment architecture](../concepts/architecture.md) — what a running solution is made of:
  six processes with their gateways, orchestration and adapters — a device entering through an
  adapter, a webhook-and-SDK pair, a worker nothing calls — the calls that cross a process boundary,
  schemas split across two databases, and how one codebase becomes any number of them.
- [What a Blong solution is made of](../concepts/suite.md) — which level contains which: suite,
  realm, layer, handler group, handler.
- [One RPC call, end to end](../concepts/api.md) — what happens between a JSON-RPC request and the
  row it writes.
- [Intents decide what a process becomes](../concepts/intents.md) — how a command line becomes
  configuration, activated layers and a process shape.
- [What the runtime does around one handler](../patterns/handler.md) — which parts of a call the
  handler author does not write.
- [From a merged commit to a running suite](../patterns/deployment.md) — how a release reaches a
  cluster, and what stands between the two.
- [A CI run and the evidence it leaves](../rationale/ci-report.md) — what a build publishes, and
  where the answer to "why is it red" lives.

## How a diagram is produced

Each diagram is authored as a JSON candidate — the source of truth, under `docs/blong/draw/archify/`
— and rendered to one self-contained HTML file that the docs site serves from its own origin.
`docs/blong/diagrams.json` is the register that says which candidates exist, where each is rendered,
and where its poster lives.

The rendered file is a build output and is not committed, so the deploy stages it first:

```bash
cd docs/blong
npm run stage-diagrams
```

The command also captures each diagram's poster in both themes, which is the picture a page shows
when the diagram was never staged — so a plain `npm run build` renders those, and the site builds
without the renderer and without the megabytes. It needs the Archify CLI, which is not a dependency
of this repository, so point `ARCHIFY_BIN` at an installed copy:

```bash
ARCHIFY_BIN=$HOME/.agents/skills/archify/bin/archify.mjs npm run stage-diagrams
```

Editing a diagram means editing its candidate and running that command; the rendered file and the
posters follow, and a diff of the candidates and the posters is what a review reads.
