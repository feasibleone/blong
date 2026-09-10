# Kukum pattern

How to call the kukum API, and how to extend it when the framework or its primitives change.

See the [concept](../concepts/kukum.md) for what kukum is, and the
[rationale](../rationale/kukum.md) for why it is shaped this way. The package README
(`core/blong-kukum/README.md`) has the layout and the commands.

## The API surface

Two shapes, both derived from the catalogue:

```text
kukum.<primitive>.<predicate>   predicate ∈ find | get | add | edit | check
kukum.<cross-cutting endpoint>
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

| Cross-cutting endpoint   | Answers                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `kukum.primitive.find`   | the catalogue, each primitive's kinds and its owning skill |
| `kukum.activation.find`  | layer → intent activation, from `WELL_KNOWN_LAYERS`        |
| `kukum.method.find`      | the method groups this process mounted                     |
| `kukum.tree.find`        | realm → group → file layout                                |
| `kukum.source.get`       | one artifact's source and its embedded instructions        |
| `kukum.source.check`     | lint a package or named files (tsc/cspell/eslint)          |
| `kukum.instruction.find` | every artifact carrying `@kukum-instructions`              |

## Calling it

### CLI

```bash
kukum primitive find
kukum handler add --subject=demo --object=item --predicate=add --kind=api --dry-run
kukum seed add --subject=demo --object=item --kind=test
kukum model find --subject=access
kukum source get orchestrator/kukum/handlers.ts
kukum source check --files=orchestrator/kukum/handlers.ts
kukum tree find --target=../blong-access
kukum activation find
kukum instruction find --target=.
```

| Option                | Meaning                                                     |
| --------------------- | ----------------------------------------------------------- |
| `--target=DIR`        | realm/suite root (default: the current directory)           |
| `--subject=NAME`      | realm name (triple subject) — lowerCamelCase                |
| `--object=NAME`       | entity name (triple object)                                 |
| `--predicate=NAME`    | handler triple predicate (standard predicates only)         |
| `--kind=KIND`         | primitive kind (see `kukum primitive find`)                 |
| `--layer`, `--group`  | layer / handler-group folder                                |
| `--platform`          | `server` \| `browser`                                       |
| `--path=FILE`         | artifact path, for `get`/`edit`/`find`                      |
| `--instructions=TEXT` | agent instructions to embed, repeatable                     |
| `--dry-run`           | plan without writing (`add`/`edit`)                         |
| `--replace`           | regenerate shared files instead of composing (`add`/`edit`) |
| `--force`             | overwrite hand-written files                                |
| `--output=json\|text` | output format (default: `json` when stdout is not a TTY)    |

Exit codes: `1` on a usage error, an unresolved method, a thrown error, or a result whose
diagnostics contain errors. That makes `kukum source check` usable as a gate.

### JSON-RPC

On a running suite (`index.ts`), the same methods are served at the dotted triple:

```bash
curl -s -X POST http://localhost:8080/rpc/kukum/handler/add \
  -H 'content-type: application/json' \
  -d '{"params":{"target":".","subject":"demo","object":"item","predicate":"add","kind":"api","dryRun":true}}'
```

`kukum.*` routes are registered with `auth: false` — kukum is local tooling that mutates source
files, like the `systemDebug` endpoints.

### In-process

`@feasibleone/blong-kukum/operation.ts` exports the whole surface. The library functions read the
platform and the live registry off `this`, so drive them the way the runtime does:

```ts
import type {PrimitiveHost} from '@feasibleone/blong-kukum/engine.ts';
import {type OperationParams, type OperationResult} from '@feasibleone/blong-kukum/operation.ts';
import addOperation from '@feasibleone/blong-kukum/orchestrator/kukum/add.ts';

const build = <T>(mod: unknown): T => (mod as (api: object) => T)({config: {}});

const host = /* a PrimitiveHost backed by node:fs */;
const result = await build<
    (this: object, id: string, params: OperationParams) => Promise<OperationResult>
>(addOperation).call({platform: host}, 'handler', {target, subject: 'demo', object: 'item'});
```

## What `add` does to an existing file

| Mode             | Existing machine-generated file            | Existing hand-written file |
| ---------------- | ------------------------------------------ | -------------------------- |
| `auto` (default) | merged via `compose`, reported as `merged` | skipped, reported          |
| `replace`        | regenerated from `files(ctx)`              | skipped unless `--force`   |

Ownership is the generated marker `import unchanged from '@feasibleone/blong'`, detected with
`includes` so it may sit on any line. Only `.ts`/`.tsx` files are judged this way — YAML, SQL and
JSON artifacts never carry it and are therefore always refreshable.

Adding an entity must never drop its neighbours, which is why the shared artifacts (a test group
list, a schema registry, a Playwright spec holding one `describe` per entity) have a `compose` hook.
When a composer cannot recognise the file it was handed it returns `undefined`, and the caller falls
back to a plain overwrite _and warns_ rather than corrupting the file.

## Instructions

Generated files can carry notes for the next agent:

```bash
kukum handler add --subject=demo --object=item --predicate=add --kind=api \
  --instructions="wire the gateway route" --instructions="add a tap test"
```

They are written as `// @kukum-instructions: …` lines after the marker, read back by
`kukum source get`, and listed by `kukum instruction find`. `edit` preserves them unless you pass
replacements.

## Maintenance recipes

### Add a primitive

1. Create `primitives/<id>.ts`:

    ```ts
    import type {PrimitiveDescriptor} from '../engine.ts';
    import {checkLayer} from './checks.ts';

    const thing: PrimitiveDescriptor = {
        id: 'thing',
        title: 'Thing',
        skill: 'blong-thing', // the prose that owns this recipe
        summary: 'One sentence an agent can act on.',
        kinds: ['default'],
        defaultKind: 'default',
        roots: ['thing'], // where `find` looks
        check: ctx => checkLayer(ctx, ['orchestrator']),
        files: ctx => [{path: `thing/${ctx.subject}.ts`, content: `// ${ctx.subject}\n`}],
    };

    export default thing;
    ```

2. Add one import and one entry to `PRIMITIVES` in `primitives/index.ts`.

That is the whole change: `handlers.ts` and `validation.ts` iterate the catalogue, so five routes,
their validation entries and CLI support appear with no further wiring.

Add `compose(options)` when the artifact is a _shared_ file that other entities also contribute to.

### Change what a primitive generates

- Edit `files(ctx)`. Available tokens: `$subject`, `$Subject`, `$object`, `$Object`.
- Use `compose(options)` (with `readGenerated`) for shared files instead of relying on `files`.
- If the new output must register something in an existing file, add a narrow helper to `merge.ts`
  that recognises one stable shape and returns `undefined` when it does not match.
- If it needs prose an agent must follow, write that prose into the skill named by `skill` — not
  into the descriptor's `summary`.

### Add or change a predicate

1. Add it to `PREDICATES` in `engine.ts`.
2. Add `orchestrator/kukum/<predicate>.ts` — one file serves every primitive, so the file name is
   the predicate alone (skip the segment that differs).
3. If it is a canonical Blong predicate, add it to `STANDARD_PREDICATES` in `primitives/checks.ts`
   so `handler`'s guardrail accepts it. The `blong-handler` skill
   (`.github/skills/blong-handler/SKILL.md`) lists the canonical order — reuse one before inventing.
4. Render it in the CLI's `textOf` if the default rendering is not enough.

### File names must match the endpoint

The file name is the endpoint path with the `kukum` namespace dropped. When one file serves several
heterogeneous paths, **skip** the segment that differs; when it serves one path, use the whole path.

| Endpoint                                 | File                             |
| ---------------------------------------- | -------------------------------- |
| `kukum.primitive.find`                   | `primitiveFind.ts`               |
| `kukum.source.get`, `kukum.source.check` | `sourceGet.ts`, `sourceCheck.ts` |
| `kukum.<primitive>.add` (all fourteen)   | `add.ts`                         |
| `kukum.<primitive>.find` (all fourteen)  | `find.ts`                        |

Never double-book a name. The generic word is _not_ available for the per-primitive files precisely
because `kukum.primitive.find` is a real endpoint: `primitiveFind` already belongs to the catalogue.

### Keep the engine and the plumbing in place

- `engine.ts` stays pure — no framework imports, no globals, the host passed in.
- Shared types, guards and helpers go in the package-root `operation.ts`. They must **not** live in
  `orchestrator/kukum/`: every `.ts` file in a handler-group folder is loaded as a handler, and a
  helpers module has nothing for the loader to classify.

### Verify a change

```bash
node --run ci-lint                # the only type gate — tap strips types without checking them
node --run ci-test                # the package suite
node --run kukum:fixture          # regenerate + verify the committed fixture, review the diff
node --run kukum:fixture:update   # also refresh the Playwright PNGs, then review the images
```

`e2e.test.ts` only ever compares; it never updates its own expectations. Regenerating the fixture
and refreshing the baselines are the job of `bin/fixture.ts`, run deliberately by a human who
reviews the result. The fixture definition in `core/blong-kukum/fixture.ts` (`SUBJECT`,
`TEMPLATE_OBJECT`, `ADDED`) is read by both the test and the regenerator, so they cannot disagree
about what the fixture contains — and `ADDED` should only ever list primitives the fixture realm's
test legs can actually exercise.
