# blong-dev: the development CLI

`blong-dev` is the command line the repository is worked with — by people at a terminal and by
coding agents through the same binary. It exists because the loop around the framework has a dozen
small jobs that each used to be a paragraph of shell in someone's notes: query the development
database, read back a log from a run that has finished, open a Playwright trace, put plain JSON in
front of an encrypted gateway, run the tests, turn their output into the one report CI consumes,
check the generated documentation and keep the memory files.

```bash
node tools/blong-dev/bin/blong-dev.ts <command> [args]
```

It is a workspace package (`@feasibleone/blong-dev`, binary `blong-dev`) and not a published tool:
the commands assume they are running inside a checkout, and several of them read the repository's
own configuration (`.blong_devrc`, `rush.json`, the memory files).

## The commands

| Command             | The problem it removes                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `lint [files…]`     | Which of tsc, cspell and eslint to run, with which config, over which files.                  |
| `lint-staged`       | The same, fanned out over every package the staged files belong to.                           |
| `test`              | A TAP wall and a report format nobody remembers.                                              |
| `playwright [args]` | Running the browser suite and then assembling its Allure report and CI contract by hand.      |
| `report <runner>`   | Turning another runner's raw output (vitest) into the same CI contract.                       |
| `ci-report`         | Aggregating every package's report into the one file CI publishes, with metrics and a bundle. |
| `proxy`             | The gateway speaks MLE; curl does not.                                                        |
| `trace <trace.zip>` | Unzipping a Playwright trace and reading JSON lines to find out which step failed.            |
| `log [ulid]`        | Log lines that only existed live, in a terminal that has been closed.                         |
| `sql [query]`       | Reaching into a pod with a MySQL client to look at development data.                          |
| `memory <verb>`     | Agents hand-editing the memory format, and forgetting its index and wrapping.                 |
| `docs <verb>`       | Refreshing a generated diagram or screenshot and proving it is not stale.                     |

## Linting and tests

```bash
blong-dev lint --files $(git diff --name-only)
blong-dev lint-staged              # what the pre-commit hook runs
blong-dev test                     # tap, in the current package
blong-dev playwright --coverage
```

`lint` bundles its own cspell, eslint and tsc, so it works from any package without that package
declaring them. Passed files narrow the spell and lint work; the type check still covers the
package, because a file cannot be type-checked in isolation. `lint-staged` is the same command
applied per-package over `git diff --cached`.

`test` runs tap in the current package, keeps the TAP in `.ci-report/` and prints a compact failure
view — enough that a failing suite is readable without reaching for `--reporter`. `playwright` wraps
the browser runner and builds the Allure report; `report vitest` exists so a package that runs
vitest (such as `blong-browser`) feeds the _same_ `.ci-report/` contract, which is what lets
`ci-report` aggregate a monorepo whose packages do not share a runner.

## The proxy: curl cannot speak MLE

The gateway's RPC endpoint is encrypted end to end, which is a good property and a bad development
loop. `blong-dev proxy` sits between plain HTTP and that endpoint: it performs the MLE handshake on
startup, optionally logs in, then forwards each request encrypted and returns the decrypted result
as plain JSON.

```bash
# Pre-authenticated: log in on startup (or from MLE_USERNAME / MLE_PASSWORD)
blong-dev proxy --port 8099 --target http://localhost:8080 \
    --username testAdmin --password testPassword

# Manual login: the handshake happens through the proxy
blong-dev proxy --port 8099 --target http://localhost:8080 --no-login
curl -s -X POST http://localhost:8099/login/token/create \
     -H 'content-type: application/json' -d '{}'
```

The method comes from the path (`/rpc/gateway/bundle/find` → `gateway.bundle.find`) or from a dotted
`method` in the body, so anything that can send HTTP can now call the gateway:

```bash
curl -s -X POST http://localhost:8099/gateway/bundle/find \
     -H 'content-type: application/json' -d '{"params":{"paging":{}}}'
```

## Traces and logs

```bash
blong-dev trace .playwright/results/my-test/trace.zip
blong-dev log --level error --name gateway --limit 20
blong-dev log 01J8Z6…            # one entry, as JSON
```

A Playwright trace is a zip of JSON lines, and a failed test often captures no screenshot, so
`trace` prints the action timeline, the requests that failed and a console count. It reads every
numbered `*-trace.trace` chunk rather than the first one, because a run long enough to split its
trace keeps the interesting events in the later chunks.

`log` reads the entries the `pino-cacache` transport wrote to disk (default `~/.blong/log-cache`,
`$BLONG_LOG_CACHE` to move it), which is what makes a log line from a run that has already finished
recoverable. It filters by level, service name, trace id, method or free text, and a ULID prints one
entry in full.

## The development database

```bash
blong-dev sql "SELECT * FROM access_role"
blong-dev sql "SELECT 1" --output json
```

`sql` opens a MySQL connection from `.blong_devrc` (found in the current directory or its parents,
or in the home directory; the key defaults to `srv.db.knex.connection`) and falls back to the
development defaults, deriving the database name as `<suite>-<user>` when none is configured.
Multiple statements separated by `;` run in one round trip. `--output json` exists for the non-TTY
case, which is what makes the command usable from an agent as well as from a terminal.

## Docs and memory

```bash
blong-dev docs list            # the register of generated artefacts
blong-dev docs check           # regenerate, compare, restore — non-zero when stale
blong-dev docs verify          # build/serve the site and load every page in Chromium
blong-dev memory add friction --title "…" --area core/blong-browser --body "…"
blong-dev memory check
```

`docs` reads `docs/blong/docs-artifacts.json`, the register of everything in the documentation site
that is generated rather than written. `check` snapshots the destinations, runs the generators and
restores them, so a stale diagram is a non-zero exit rather than a silent difference in review;
`verify` starts its own static server (a Docusaurus build does not resolve absolute asset paths over
`file://`), loads every page and every blog post in Chromium, and reports the diagrams and images it
expected against those that rendered.

`memory` is the writer and validator of the agent memory files: it owns the identifiers, the section
an entry belongs to, the wrapping and the generated index, and `check` is the gate — it is wired
into the staged-file lint, so a malformed memory file fails a commit rather than a review comment.

## Why agents and people use the same commands

The reason this is one CLI rather than a set of convenience scripts is that the development loop and
the agent loop have the same shape. An agent asked to fix a failing test needs the same four things
a person needs: the test's output, the persisted log, the query against the development database,
and the memory file that records what was learned. When those are commands, both callers can run
them — and the repositories' own instructions say so, pointing agents at `blong-dev memory`,
`blong-dev sql` and `blong-dev lint` by name.

Two small conventions keep that honest. Anything with output gets a machine mode (`--output json`,
`list --json`) beside its human one. And anything that would otherwise be a one-off shell
incantation becomes a command, so it can be tested and documented.

## See also

- [The log](log.md) and [the log viewer](semantic-log.md) — what `log` reads.
- [Playwright](playwright.md) — the suite `playwright` runs and `trace` explains.
- [Memory](memory.md) — the format `memory` writes.
- [Integration tests in CI](test-int.md) — what `report` and `ci-report` produce.
