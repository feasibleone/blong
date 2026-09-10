# Realm CLI

How to give a realm a command-line entry point: a process that binds no port, watches nothing,
resolves every dispatch in-process and exits when the command is done.

The working example is
[demo/blong-cli](https://github.com/feasibleone/blong/tree/main/demo/blong-cli) — a minimal realm
(`text`) plus its command. The framework side is
[core/blong-gogo/src/cli.ts](https://github.com/feasibleone/blong/blob/main/core/blong-gogo/src/cli.ts).

## What the `cli` intent does

`blong <suite> cli` (or, from a command, `load(suite, name, name, ['cli'])`) switches off everything
that exists to serve someone else:

| Switched off                                   | Why it does not matter here                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `gateway`, `apiGateway`, `rpcServer`, `restFs` | nothing is listening, so there is nothing to route                                                               |
| `systemDebug`                                  | no `/api/sys/*` introspection endpoint                                                                           |
| `mcp`                                          | no tool endpoint                                                                                                 |
| `watch`                                        | no chokidar; the load step that records folders/files **still runs**, so `method.find`/`tree.find` are populated |
| `resolution`                                   | nothing to resolve between realms                                                                                |
| HTTP `remote`                                  | `remote: {canSkipSocket: true}` — dispatch resolves in-process                                                   |

It also defaults the framework's own logging to `warn` (`log.level`, `apiSchema.logLevel`), because
a command's stdout carries its result.

## The command

`runCli` owns everything that is identical in every realm CLI:

```ts
import {isCliEntry, runCli, type CliOptions} from '@feasibleone/blong-gogo/cli.ts';

import cliSuite from '../cli.ts';

const USAGE = `my-realm — what it does

Usage
  my-realm <object> <predicate> [--value=TEXT]
`;

function command({positionals, argv}: ParsedArgs) {
    const [object, predicate] = positionals;
    if (!object) return undefined; // prints the usage and exits 1
    return {
        method: `myRealm.${object}.${predicate ?? 'get'}`,
        params: {value: argv.value === undefined ? undefined : String(argv.value)},
    };
}

const options: CliOptions = {
    suite: cliSuite,
    name: 'my-realm',
    usage: USAGE,
    stringFlags: ['value', 'output'],
    command,
    format: (method, result) => String(result),
    hint: 'Run `my-realm help` for the command list.',
};

if (isCliEntry(import.meta.url)) await runCli(options);
```

| `CliOptions` field | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `suite`            | The module the `cli` intent loads — normally the realm's `cli.ts`     |
| `name`             | Suite and registry name; also the prefix of every error message       |
| `usage`            | Printed for `--help` and before a usage error                         |
| `stringFlags`      | Flags parsed as strings (repeatable); others are boolean/numeric      |
| `intents`          | Passed to `load`; defaults to `['cli']`                               |
| `command`          | `({argv, positionals}) => {method, params}`; `undefined` prints usage |
| `format`           | Rendering for `--output=text`; `undefined` falls back to JSON         |
| `exitCodeFor`      | Non-zero exit for a call that completed (e.g. diagnostics errors)     |
| `hint`             | Appended to the unknown-method error                                  |

Exit codes: `1` for a usage error, an unknown method, a thrown error, or whatever `exitCodeFor`
returns. `runCli` sets `process.exitCode` rather than calling `process.exit()`, so your own cleanup
still runs.

### Method resolution

A method is only present if **its port's own handler table** says so:

```ts
port.handles(method) === true; // matches the namespace PREFIX — also true for methods that do not exist
typeof port.findHandler(method) === 'function'; // the real test
```

`resolveMethod(registry, method)` applies both. Skipping the second check makes an unknown method
look present and fall through to an HTTP call against a process that binds no port.

## The suite

The suite the command loads is a `server()` definition whose children are the realms:

```ts
// cli.ts
import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    children: [
        async function myRealm() {
            return import('./myRealm/server.ts');
        },
    ],
    config: {
        default: {myRealm: {}},
        cli: {},
    },
}));
```

Two points:

- **A child needs a config key under an active intent** (`default: {myRealm: {}}`) or it loads but
  contributes no ports, and there is nothing to dispatch to.
- **`server.ts` and `index.ts` are not needed.** A command has nothing to serve, so `cli.ts` is the
  only suite. Not every package needs both modes.

The realm itself needs no `adapter/db`, no `meta/` and no browser entry. Its `orchestrator/` group
is what provides the port:

```ts
// myRealm/orchestrator/myRealm.ts
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {namespace: 'myRealm', imports: [/\.myRealm$/], logLevel: 'info'},
        cli: {logLevel: 'warn'},
    },
}));
```

A realm folder also needs a `package.json` beside its `server.ts` — the loader imports it.

## Three things that will bite

**A library function reads `this`, so call it as a member.** A `library()` function gets the layer
object as `this` (that is where `this.platform` and `this.registry` come from). Destructuring it
into a local first strips the receiver:

```ts
const {textInput} = lib; // `this` is undefined inside — TypeError
lib.textInput(params); // correct
(lib as unknown as MyLib).textInput(params); // correct, and typed
```

**`--output` defaults on whether stdout is a TTY** — `text` for a human, `json` when piped. Right
for a person, a trap for a test: pass `--output=text` or `--output=json` explicitly when asserting.

**The component log level is not part of the intent's defaults.** The framework quietens its own
components and the generated-directory announcements, but a component's `logLevel` lives in its
`activation` and the framework does not know component names. Without `cli: {logLevel: 'warn'}` the
dispatch events (`adapter.start`, `adapter.ready`, `adapter.stop`) are written straight to fd 1 and
land in the middle of the result — so every command-driven component declares that one line.

## Testing a command

Spawn the binary and assert the three channels. Importing a handler proves nothing about the
command:

```ts
const run = (args: string[]) => {
    const result = spawnSync(process.execPath, [bin, ...args], {encoding: 'utf-8'});
    return {stdout: result.stdout, stderr: result.stderr, status: result.status};
};

t.equal(
    run(['slug', 'get', '--value=Hello, World!', '--output=text']).stdout.trim(),
    'hello-world',
);
t.equal(run(['bogus', 'get']).status, 1);
t.equal(run(['--help']).status, 0);
```

Note that a real log line is indistinguishable from a real failure, so asserting `stderr` is empty
on the success path is worth doing: it is what catches a component that forgot its
`cli: {logLevel}`.

## Checklist

- [ ] `cli.ts` is a `server()` definition with a `default` config key per child
- [ ] The realm folder has its own `package.json`
- [ ] Every command-driven component declares `cli: {logLevel: 'warn'}`
- [ ] Handlers are one function per file, named with the semantic triple
- [ ] Shared logic is in `library()` functions, called as members
- [ ] `bin/*.ts` passes `suite`, `name`, `usage`, `command` to `runCli` and guards with `isCliEntry`
- [ ] Tests spawn the binary and assert stdout, stderr and the exit code
