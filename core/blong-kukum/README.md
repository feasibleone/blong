# blong-kukum — primitive scaffolding, introspection and modification API

`@feasibleone/blong-kukum` turns the file recipes in the Blong skills into a **programmable API**.
An agent (or a human) asks for `kukum.handler.add` and gets the same artifacts `blong-handler`
describes — without transcribing a folder layout by hand, and with the names, layers and predicates
validated against `.github/skills/_shared/conventions.md` _before_ anything is written.

Its second job is introspection. `primitive.find`, `activation.find`, `method.find`, `tree.find`,
`source.get`, `source.check` and `instruction.find` answer three questions: what can be generated,
what is wired up in this process right now, and what does the code on disk say still needs doing?

- **Concept** — what kukum is:
  [`docs/blong/docs/concepts/kukum.md`](../../docs/blong/docs/concepts/kukum.md)
- **Pattern** — how to use it and how to extend it:
  [`docs/blong/docs/patterns/kukum.md`](../../docs/blong/docs/patterns/kukum.md)
- **Rationale** — why it is shaped this way:
  [`docs/blong/docs/rationale/kukum.md`](../../docs/blong/docs/rationale/kukum.md)

## The three entry points

| Entry point    | How                                                     | When                                   |
| -------------- | ------------------------------------------------------- | -------------------------------------- |
| CLI            | `kukum <primitive> <predicate> [options]`               | a terminal, or an agent shell          |
| JSON-RPC / MCP | `POST /rpc/kukum/{primitive}/{predicate}`               | against a running suite (`index.ts`)   |
| In-process     | `import … from '@feasibleone/blong-kukum/operation.ts'` | from tests or other tooling, no server |

The CLI is deliberately **not** a second implementation. It loads the same realm through the `cli`
intent (`cli.ts`) and dispatches through the same handler map the JSON-RPC surface serves, so a
registry-backed answer (`method.find`, `tree.find`) is the real one rather than an approximation.

```bash
kukum primitive find                                  # list primitives and their kinds
kukum handler add --subject=demo --object=item --predicate=add --kind=api --dry-run
kukum schema add --subject=demo --object=order --kind=table
kukum source get orchestrator/kukum/handlers.ts
kukum source check --files=orchestrator/kukum/handlers.ts
kukum tree find --target=../blong-access
kukum instruction find --target=.
```

| Option                | Meaning                                                     |
| --------------------- | ----------------------------------------------------------- |
| `--target=DIR`        | realm/suite root (default: the current directory)           |
| `--subject=NAME`      | realm name (the triple subject) — must be lowerCamelCase    |
| `--object=NAME`       | entity name (the triple object)                             |
| `--predicate=NAME`    | handler triple predicate (must be a standard one)           |
| `--kind=KIND`         | primitive kind (see `kukum primitive find`)                 |
| `--layer`, `--group`  | layer / handler-group folder                                |
| `--platform`          | `server` \| `browser`                                       |
| `--path=FILE`         | artifact path, for `get`/`edit`/`find`                      |
| `--instructions=TEXT` | coding-agent instructions to embed, repeatable              |
| `--dry-run`           | plan without writing (`add`/`edit`)                         |
| `--replace`           | regenerate shared files instead of composing (`add`/`edit`) |
| `--force`             | overwrite hand-written files                                |
| `--output=json\|text` | output format (default: `json` when stdout is not a TTY)    |

`kukum` exits `1` on a usage error, on an unresolved method, on a thrown error, and when the result
carries diagnostics with errors — so `kukum source check` is usable as a gate.

## The API surface

The routes are **derived**, not hand-listed: `handlers.ts` and `validation.ts` both iterate
`PRIMITIVES × PREDICATES`, so the catalogue is the only list.

```text
kukum.<primitive>.<predicate>       predicate ∈ find | get | add | edit | check
kukum.<cross-cutting endpoint>      see the table below
```

| Primitive      | Owning skill          | Kinds                                                                    |
| -------------- | --------------------- | ------------------------------------------------------------------------ |
| `realm`        | `blong-realm`         | `default` (the whole `blong-kopi` tree)                                  |
| `suite`        | `blong-suite`         | `default`                                                                |
| `layer`        | `blong-layer`         | `server`, `browser`, `custom`                                            |
| `handler`      | `blong-handler`       | `api`, `library`, `db`, `super`, `libBindings`                           |
| `orchestrator` | `blong-orchestrator`  | `dispatch`, `init`, `schedule`                                           |
| `adapter`      | `blong-adapter`       | `http`, `tcp`, `knex`, `webhook`, `mongodb`, `k8s`, `s3`, `mock`, `base` |
| `error`        | `blong-error`         | `layer`, `inline`, `librarySet`                                          |
| `schema`       | `blong-schema`        | `table`, `register`, `procedure`                                         |
| `seed`         | `blong-schema`        | `prod`, `test`                                                           |
| `model`        | `blong-model`         | `model`, `fixture`                                                       |
| `test`         | `blong-test`          | `server`, `browser`, `playwright`                                        |
| `gateway`      | `blong-rest`          | `validation`, `openapi`                                                  |
| `component`    | `blong-browser`       | `component`, `actions`, `portal`                                         |
| `storybook`    | `storybook-v10-setup` | `main`, `preview`, `story`                                               |

`kukum primitive find` returns this table plus each primitive's summary and default kind, so an
agent can discover the surface at runtime instead of being fed it.

| Cross-cutting endpoint   | Answers                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `kukum.primitive.find`   | the catalogue above                                          |
| `kukum.activation.find`  | layer → intent activation, straight from `WELL_KNOWN_LAYERS` |
| `kukum.method.find`      | the method groups this process actually mounted              |
| `kukum.tree.find`        | realm → group → file layout, from the registry and disk      |
| `kukum.source.get`       | one artifact's source plus the instructions embedded in it   |
| `kukum.source.check`     | lint a package, or named files, via tsc/cspell/eslint        |
| `kukum.instruction.find` | every artifact carrying `@kukum-instructions`                |

## Package layout

```text
cli.ts                     suite the `kukum` command runs on (this realm only, no listeners)
server.ts                  the suite for a served process (gateway + /rpc + MCP)
engine.ts                  pure planning/merging logic and the descriptor contract
operation.ts               shared plumbing for the operation library functions
merge.ts                   text-level merge helpers for shared files
primitives/                the catalogue — one descriptor per primitive
  index.ts                 PRIMITIVES, PRIMITIVE_IDS, getPrimitive, previewFiles
  checks.ts                STANDARD_PREDICATES, checkLayer
  shared.ts                layerOf, groupOf, seedRowName (dependency-free leaves)
  compose.ts               readGenerated — the reading side of composition
orchestrator/
  kukum.ts                 dispatch orchestrator: namespace `kukum`
  kukum/                   the API surface — one library function per endpoint
    handlers.ts            generates the method map from PRIMITIVES × PREDICATES
    validation.ts          generates the gateway validation entries
    add.ts edit.ts find.ts get.ts check.ts          <primitive>.<predicate>
    primitiveFind.ts … instructionFind.ts           the cross-cutting endpoints
bin/
  kukum.ts                 the CLI: load, dispatch, print
  fixture.ts               regenerate the e2e fixture (+ --baselines)
fixture.ts                 the fixture definition, read by both the test and the CLI
test/fixture/e2e-realm/    the committed end-to-end fixture (generated; see below)
```

## How generation works

1. A **descriptor** declares what a primitive is: `id`, `title`, the `skill` that owns its prose,
   `kinds`, `roots` (where `find` looks), and `files(ctx)` — the target paths plus template source.
   It may add `compose(options)`, the merge-aware variant that reads what is on disk, and
   `check(ctx)`, the guardrails that run before anything is written.
2. The **engine** turns a descriptor plus a context into `FileChange[]` (`plan`), and writes them
   (`apply`). It is pure and host-injected — the same code plans for a running realm (via
   `this.platform`) and for the CLI (via a thin `node:fs` adapter).
3. **Ownership** is decided by the generated marker (`import unchanged from '@feasibleone/blong'`).
   A file carrying it is machine-owned and may be regenerated; a `.ts` file without it is
   hand-written and is _refused_, not overwritten, unless `--force`. YAML/SQL/JSON artifacts never
   carry the marker and are therefore always refreshable.
4. **`mode`** decides how an existing file is treated. `auto` (default) calls `compose` so adding an
   entity extends the shared files instead of dropping its neighbours; `replace` regenerates the
   descriptor's plain output and overwrites.
5. **Instructions** (`@kukum-instructions`) are embedded into generated files and read back by
   `source get` / `instruction find`, so an artifact can tell the next agent what still needs doing.

## Tests

| File                 | Proves                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| `engine.test.ts`     | planning, naming and token substitution in isolation, with an injected host      |
| `merge.test.ts`      | the merge helpers extend shared files instead of replacing them                  |
| `operations.test.ts` | each operation's behaviour: overwrite reporting, merge mode, instruction walking |
| `libraries.test.ts`  | the bindings are thin — they read `platform`/`registry` off `this`               |
| `index.test.ts`      | the API over real JSON-RPC: every method registered, unique, and answering       |
| `scaffold.test.ts`   | a realm from `realm add` runs its own suite; every primitive/kind can be added   |
| `e2e.test.ts`        | the committed fixture is exactly what regeneration produces, and it passes       |

## Maintaining this package

These are the invariants. The step-by-step recipes are in
[`docs/blong/docs/patterns/kukum.md`](../../docs/blong/docs/patterns/kukum.md).

**A primitive is a file plus one line.** Add `primitives/<id>.ts` and an entry in `PRIMITIVES`
(`primitives/index.ts`). Its five routes, their validation entries and their CLI support appear
automatically — nothing else enumerates primitives, and nothing should start.

**Descriptors are data, not handlers.** A descriptor is a record plus pure template functions.
Wrapping one in `library()` would put it in the dispatch graph for no benefit.

**The file name is the endpoint path minus the `kukum` namespace.** When one file serves several
heterogeneous paths, skip the segment that differs. Never double-book a name: `kukum.primitive.find`
is a real endpoint, so `primitiveFind` belongs to the catalogue — which is why the per-primitive
files are `add.ts`, `find.ts`, … and not `primitiveAdd.ts`.

**Shared plumbing goes in the package root, never in `orchestrator/kukum/`.** Every `.ts` in a
handler-group folder is loaded as a handler; a helpers module has nothing for the loader to
classify. `operation.ts` is the home for the types, guards and shared helpers.

**Keep the engine free of the runtime.** `engine.ts` must not import the framework or reach for a
global filesystem. That is what lets the CLI, the realm and the tests share one implementation.

**A descriptor names its skill — keep them in step.** The `skill` field is the prose contract. When
a skill changes its recipe, the descriptor changes in the same commit and the fixture is regenerated
and reviewed. This is the main way generated artifacts drift from the documentation.

**Guardrails live in `check()`** (shared ones in `primitives/checks.ts`). They mirror
`_shared/conventions.md`: names must be lowerCamelCase, an object must be a single word, a predicate
must be standard (`STANDARD_PREDICATES`), and a descriptor may only write into the layers it
declares (`checkLayer`). Tighten a guardrail here rather than documenting a rule nobody enforces.

**Shared-file generators need a merge helper.** If a template must register something in a file that
other entities also contribute to (a test group in `browser-test.ts`, an entry in the schema
registry), add a narrow helper to `merge.ts` that recognises one stable shape and returns
`undefined` when it does not match — so the caller warns instead of corrupting the file.

**The fixture is a contract, and the test never updates it.** `e2e.test.ts` regenerates
`test/fixture/e2e-realm` (its generated files are gitignored) and asserts the result. The Playwright
PNG baselines _are_ committed because they pin the generated UI. `e2e.test.ts` only compares — a
test that refreshed its own baselines would assert nothing.

```bash
node --run kukum:fixture           # regenerate + verify; review the diff
node --run kukum:fixture:update    # also refresh the PNG baselines; review the images
```

The fixture definition lives in `fixture.ts` (`SUBJECT`, `TEMPLATE_OBJECT`, `ADDED`) and is read by
both the test and the regenerator, so the two cannot disagree about what the fixture contains.
`ADDED` is deliberately limited to primitives the realm's test legs can actually exercise — adding
an artifact no test covers would quietly make the coverage assertion vacuous.

**Verify with the package scripts.** `tap` strips types without checking them, so
`node --run ci-lint` is the only gate for type errors; `node --run ci-test` runs the suite.
