# blong-cli — a demo realm driven by the `cli` intent

The smallest thing that shows what the `cli` intent is for: a **realm** that is driven by a
**command**, with no HTTP server, no watcher and no database anywhere.

```bash
blong-cli slug get --value="Hello, World!"     # hello-world
blong-cli statistics get --file=README.md      # lines/words/characters
blong-cli slug get --value="Hello, World!" --output=json
blong-cli help
```

The realm itself (`text`) is deliberately trivial — the demo is about the intent, not the domain.

## What the `cli` intent does

It switches the gateway, the RPC server, the API gateway, rest-fs, system debug and MCP off, turns
the watcher off, resolves every dispatch **in-process**, and quietens the framework's own logging so
a command's stdout carries its result and nothing else.

Two consequences are worth noticing:

- **There is no `server.ts` and no `index.ts`.** The realm has nothing to serve and nothing to
  listen on, so `cli.ts` is the only suite. A command can be a whole application.
- **The process exits when the command is done** — not because anything calls `process.exit()`, but
  because nothing is bound to keep the event loop alive.

The subtle part is that the realm is still a realm: the same `orchestrator.dispatch` port that a
served suite would route `/rpc/text/slug/get` to is the one the command resolves against. A command
and an API call reach the same handler.

## Layout

```text
cli.ts                                     the suite the command loads
bin/blong-cli.ts                           the command
index.test.ts                              the command's contract, asserted
text/                                      the realm
  server.ts                                realm entry (layers auto-discovered)
  orchestrator/text.ts                     dispatch orchestrator — namespace `text`
  orchestrator/text/textInput.ts           library function, shared by both handlers
  orchestrator/text/textSlugGet.ts         text.slug.get
  orchestrator/text/textStatisticsGet.ts   text.statistics.get
```

## Where the plumbing lives

`bin/blong-cli.ts` is about forty lines because the rest is `@feasibleone/blong-gogo/cli.ts` —
extracted from `core/blong-kukum/bin/kukum.ts` when this demo turned out to need exactly the same
things:

| Provided by the framework                        | Provided by this package    |
| ------------------------------------------------ | --------------------------- |
| Loading the suite on the `cli` intent            | the usage text              |
| Resolving a method against the live registry     | how arguments name a method |
| `handles()` vs `findHandler` (see below)         | how a result reads          |
| Keeping stdout for the result, logging to stderr |                             |
| `--output=json\|text`, defaulting on TTY         |                             |
| `load → start → dispatch → stop`                 |                             |
| exit codes: usage, unknown method, thrown error  |                             |
| the `import.meta.url` entry guard                |                             |

A command is then just:

```ts
export const options: CliOptions = {
    suite: cliSuite,
    name: 'blong-cli',
    usage: USAGE,
    command: ({positionals, argv}) => ({method: …, params: …}),
    format: (method, result) => …,
};

if (isCliEntry(import.meta.url)) await runCli(options);
```

One detail worth keeping: a method is only present if **its port's own handler table** says so.
`port.handles()` matches the namespace _prefix_, so it answers `true` for a method that does not
exist; `findHandler()` returning a function is the real test. That is what lets the command report
an unknown method instead of falling through to an HTTP call against a process that binds no port.

## Running it

```bash
node ./bin/blong-cli.ts slug get --value="Hello, World!"   # direct
npm run cli -- slug get --value="Hello, World!"            # via the script
node --run ci-test                                         # the contract, asserted
node --run ci-lint
```

`index.test.ts` spawns the real binary rather than importing a handler: what the demo claims is that
a realm can be driven end to end by the intent, and the only proof of that is running the command
and looking at its stdout, its stderr and its exit code.

## Using it as a starting point

Copy this package, rename the realm (folder = namespace = subject), and replace the handlers. Keep
the following:

- `cli.ts` stays a `server()` definition with a `default` config block per child — without a key
  under an active intent the child loads but contributes no ports.
- Handlers stay one function per file, named with the semantic triple, with the shared parts in
  `library()` functions beside them.
- `this.platform` is the Node platform under `cli`, so a command can read and write files; that is
  the reason a realm like `blong-kukum` works as a command.
