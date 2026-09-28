# Folder mode and scaffolding

There is no project to generate before you can run something. A folder with a couple of handler
files in it is a server, and a suite that names a realm whose folder does not exist yet gets that
realm created from the same template. Both paths share one template package, `core/blong-kopi/`.

## Run from a folder

The server is started from the folder rather than pointed at it — a positional argument to `blong`
is treated as a suite _file_, so a directory argument is refused:

```bash
cd my-handlers
blong            # or: blong cli, for a run that serves nothing
```

What the folder is, is decided by what it contains:

| Contents                                        | Kind       | What happens                                 |
| ----------------------------------------------- | ---------- | -------------------------------------------- |
| `server.ts` / `browser.ts` / `index.ts`         | `suite`    | run as an entry point (the ordinary case)    |
| `realm.ts`                                      | `realm`    | run as a realm component                     |
| handler files, no well-known layer folder       | `handlers` | synthesise a server from the files           |
| handler files **and** a well-known layer folder | `mixed`    | the same synthesis, with the real layer kept |
| none of the above                               | `unknown`  | fail, naming the folder it looked in         |

A file counts as a handler when its name is `subjectObjectPredicate`-shaped — a lowercase first word
followed by an internal capital, e.g. `mathNumberSum.ts`. The framework groups them by the first
word, and gives each group a namespace plus the dispatch orchestrator that publishes it. Files whose
names do not match, and files starting with `.` or `~`, are ignored.

Synthesis mirrors what a suite would declare by hand, in this order for a folder of `helloHello.ts`,
`helloGoodbye.ts` and `mathNumberSum.ts`:

1. the group `hello.hello` and the namespace `hello`, from the two `hello*` handlers;
2. the group `hello.math` and the namespace `math`;
3. one dispatch orchestrator per namespace (`helloDispatch`, `mathDispatch`);
4. a port for the RPC server and a gateway on port 8080;
5. a folder-level `config.ts`, if there is one, merged over all of it.

That last point is what makes the mode usable beyond a demo: a `config.ts` beside the handlers can
change the ports, point at a database, or add configuration the synthesised pieces never knew about.

## Creating a realm on the spot

A realm folder that does not exist yet can be created while the suite is loading, when all four of
these hold:

1. importing the realm child failed with `MODULE_NOT_FOUND` (so it really is missing, not broken);
2. `kopi.realm` is enabled in the merged configuration (the usual place is `.blong_devrc`);
3. the missing folder name is not a well-known layer (`error`, `adapter`, `meta`, …);
4. there is no `package.json` at the target folder.

The conditions are what make the feature safe to leave on. A layer name is refused because
scaffolding a whole realm into `orchestrator/` would be nonsense; the `package.json` check makes
every folder that is already a real realm (or any other package) untouchable, so the trigger can
never overwrite work. A load error that is not "module not found" is rethrown rather than scaffolded
over.

The template writes a complete realm: `server.ts`, `browser.ts` and their entries, `error/`, `meta/`
(the schema, the seed and a model spec), `orchestrator/subject/init.ts`, `server/test/`, a
Playwright spec, the toolchain files and a `package.json`. The scaffolded realm contributes only
what is its own — the namespace in `orchestrator/subject/init.ts`, the schema and the model spec —
and reuses `blong-server`'s subject orchestrator and its `db` adapter, which is the same rule every
hand-written realm follows.

Files the template generates carry an `import unchanged …` marker and are only rewritten while that
marker is present, so a generated file you have adopted is never overwritten by a later run. Rename
the realm and its `package.json` name after the scaffold, and delete what the realm does not use
(`browser.ts` for a server-only service, for instance).

## The explicit form

The same template, without the auto-trigger:

```bash
blong realm payment                 # or: blong create realm payment
blong realm order --object order    # pick the entity the scaffold should model
kukum realm add --subject=shop      # the same thing through the primitive API
```

The CLI form creates the folder, changes into it and runs it. It refuses to start when the name is
missing, or when the word `realm` names an existing path — a real folder wins over the intent, so
running a folder called `realm` is never mistaken for creating one. The `kukum` form is the one to
use from a script or an agent: it takes `--target`, `--object` and `--dry-run`, and it validates the
name against `^[a-z][a-z0-9]*$`.

## See also

- [Realm patterns](./realm.md) — the realm layout the template produces, and the `blong-server`
  reuse
- [CLI patterns](./cli.md) — the `cli` intent, which is how a folder runs without serving anything
- [Kukum patterns](./kukum.md) — the primitive API, including `realm add`
- [Handler patterns](./handler.md) and [layer patterns](./layer.md) — the `config.ts` a folder may
  carry
- [Concept: realm](../concepts/realm.md) — what a realm is for
