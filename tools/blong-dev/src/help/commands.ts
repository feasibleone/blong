/**
 * The `blong-dev` commands, documented once for all three help levels.
 *
 * A summary is what the command list shows, the description is what the command's own
 * `--help` shows, and a verb carries its own usage, options and examples. Keep the
 * summaries to one line: they are a menu, and the detail belongs one level down.
 */

import type {IHelpCommand} from './types.ts';

export const COMMANDS: readonly IHelpCommand[] = [
    {
        name: 'lint',
        summary: 'Type-check, spell-check and lint the current package',
        description:
            "Runs tsc, cspell, eslint and markdownlint with blong-dev's own copies, so it works " +
            'from any package without that package declaring them. Named files narrow the spell ' +
            'and lint work; the type check still covers the package, because a file cannot be ' +
            'type-checked in isolation.',
        usage: 'blong-dev lint [files...] [--files <a,b>] [--fix]',
        options: [
            {
                flag: '--files <a,b>',
                description: 'comma-separated paths, instead of bare positionals',
            },
            {flag: '--fix', description: 'apply the fixes eslint and the pinned prettier can make'},
        ],
        examples: ['blong-dev lint --files $(git diff --name-only)'],
    },
    {
        name: 'lint-staged',
        summary: 'Lint the staged files, per package',
        description:
            'Applies `lint` to every package the staged files belong to, which is what the ' +
            'pre-commit hook runs and the same gate CI applies.',
        usage: 'blong-dev lint-staged',
    },
    {
        name: 'test',
        summary: "Run the package's tap tests and write its report",
        description:
            'Runs tap in the current package, keeps the full TAP stream in `.ci-report/tests.tap`, ' +
            'writes the `.ci-report/report.json` contract that `ci-report` aggregates, and prints ' +
            'only a compact failure view so the log stays readable. `--reporter` hands stdio back ' +
            'to tap and bypasses all of that.',
        usage: 'blong-dev test [globs...] [--timeout <seconds>] [--reporter <name>]',
        options: [
            {
                flag: '--timeout <seconds>',
                description: 'per-test budget handed to tap (default 240)',
            },
            {
                flag: '--reporter <name>',
                description: "one of tap's own reporters, instead of the compact view",
            },
        ],
        examples: ['blong-dev test "src/ci/*.test.ts"'],
    },
    {
        name: 'report',
        summary: 'Convert vitest or jest results into the CI report',
        description:
            'Lets a package whose tests are not driven by tap contribute the same machine-readable ' +
            'slice to `ci-report`. The exit code stays with the test runner: this command only ' +
            'reports.',
        helpOnBare: true,
        verbs: [
            {
                name: 'vitest',
                summary: 'Convert vitest JSON into .ci-report/',
                usage: 'blong-dev report vitest [--input <file>]',
                description:
                    "Reads the JSON vitest writes for its coverage run and writes this package's " +
                    'report slice from it.',
                options: [{flag: '--input <file>', description: 'default: coverage/vitest.json'}],
            },
            {
                name: 'jest',
                summary: 'Convert jest --json output into .ci-report/',
                usage: 'blong-dev report jest [--input <file>] [--runner <name>] [--status <code>]',
                description:
                    "For a leg that is jest underneath without being the package's only runner — " +
                    'the Storybook test runner beside tap. `--runner` names the slice, so the leg ' +
                    'reports under its own name and replaces only that slice.',
                options: [
                    {flag: '--input <file>', description: 'default: .ci-report/jest.json'},
                    {flag: '--runner <name>', description: 'the slice name, e.g. storybook'},
                    {flag: '--status <code>', description: "the leg's own exit code"},
                ],
                examples: [
                    'blong-dev report jest --input .ci-report/storybook.json --runner storybook',
                ],
            },
        ],
    },
    {
        name: 'ci-report',
        summary: "Aggregate every package's report into one file",
        description:
            'Merges the `.ci-report/` slice every package wrote into the run report, the failures ' +
            'bundle, the metrics document and a discussion bundle. It is the writer; `ci` reads ' +
            'the result back.',
        usage: 'blong-dev ci-report [--out <dir>] [--baseline <file>] [--base-history <file>]',
        options: [
            {
                flag: '--out <dir>',
                description: 'where the aggregate lands (default: the repository report-data)',
            },
            {flag: '--baseline <file>', description: 'a previous report to compare against'},
            {
                flag: '--base-history <file>',
                description: 'the trend history to seed the package pages from',
            },
        ],
    },
    {
        name: 'ci',
        summary: 'Explain a CI run: what failed, and why',
        description:
            "Merges the run's failure bundle, the job log's operation summary and, with `--full`, " +
            'the reports artifact — the three witnesses to a red run — into one verdict. It stays ' +
            'read-only and hypothesis-shaped: a verdict names the numbers it rests on, and a ' +
            'failure nothing explains is reported as `unknown`. With no target it diagnoses the ' +
            'release-please pull request and says which run it chose and what it passed over.',
        verbs: [
            {
                name: 'failures',
                summary: 'Explain the failures of one run',
                usage:
                    'blong-dev ci failures [--pr <n> | --run <n> | --sha <sha> | --branch <name>]\n' +
                    '                       [--repo <owner/name>] [--workflow <name>] [--site <url>]\n' +
                    '                       [--full] [--json] [--write] [--strict]',
                description:
                    'The default verb. `--full` reads the reasons out of the reports artifact — ' +
                    'the raw TAP stream a timeout is only readable from; `--write` stamps ' +
                    '`ci-diagnosis.md`; `--strict` exits non-zero when anything needs attention.',
                options: [
                    {
                        flag: '--pr <n>',
                        description: 'diagnose the newest completed run of a pull request',
                    },
                    {flag: '--run <n>', description: 'diagnose one run by number'},
                    {flag: '--sha <sha>', description: 'the newest run of a commit'},
                    {flag: '--branch <name>', description: 'the newest run of a branch'},
                    {
                        flag: '--repo <owner/name>',
                        description: 'another repository (default: the origin)',
                    },
                    {flag: '--workflow <name>', description: 'another workflow file'},
                    {flag: '--site <url>', description: 'where the published reports are served'},
                    {flag: '--full', description: 'read the reasons out of the reports artifact'},
                    {
                        flag: '--json',
                        description: 'print the machine document instead of the prose',
                    },
                    {flag: '--write', description: 'stamp ci-diagnosis.md with the same answer'},
                    {
                        flag: '--strict',
                        description: 'exit non-zero when the diagnosis needs attention',
                    },
                ],
                examples: [
                    'blong-dev ci failures',
                    'blong-dev ci failures --pr 200',
                    'blong-dev ci failures --run 622 --full',
                ],
            },
            {
                name: 'runs',
                summary: 'List recent runs and what failed in each',
                usage: 'blong-dev ci runs [--limit <n>] [--repo <owner/name>]',
                options: [{flag: '--limit <n>', description: 'how many runs to list'}],
            },
            {
                name: 'history',
                summary: "One package's verdict and test time, run by run",
                usage: 'blong-dev ci history <package...> [--limit <n>]',
                description:
                    'The comparison that separates a regression from a runner that was slow: the ' +
                    'same package across the runs that published it.',
                examples: ['blong-dev ci history blong-cli blong-kukum --limit 10'],
            },
        ],
    },
    {
        name: 'playwright',
        summary: 'Run the Playwright suite and build its reports',
        description:
            'Runs the browser suite and then assembles what a run publishes: a single-file Allure ' +
            'report under `.ci-report/publish/`, the `.ci-report/` contract for `ci-report`, and ' +
            "the package's Allure trend history. `--coverage` collects server-side V8 coverage " +
            'from the web servers Playwright starts.',
        usage: 'blong-dev playwright [playwright args...] [--coverage]',
        options: [
            {
                flag: '--coverage',
                description: 'collect V8 coverage and run the c8 report afterwards',
            },
            {
                flag: '<anything else>',
                description: 'passed through to Playwright, e.g. --update-snapshots',
            },
        ],
        examples: ['blong-dev playwright', 'blong-dev playwright --coverage'],
    },
    {
        name: 'browsers',
        summary: 'Install the browsers this package launches',
        description:
            'For the legs that do not run through `blong-dev playwright` — the Storybook test ' +
            'runner, whose Playwright is resolved by `@storybook/test-runner` rather than by the ' +
            'test script. Idempotent and silent when the browser is already cached, so a package ' +
            'script may prefix it unconditionally.',
        usage: 'blong-dev browsers [--with-deps]',
        options: [{flag: '--with-deps', description: 'also install the OS libraries (needs root)'}],
    },
    {
        name: 'proxy',
        summary: 'Plain JSON in front of the MLE RPC endpoint',
        description:
            'Sits between plain HTTP and the encrypted RPC endpoint: it performs the MLE ' +
            'handshake and, unless `--no-login`, logs in on startup, then forwards each request ' +
            'encrypted and returns the decrypted result. The method comes from the path ' +
            '(`/rpc/gateway/bundle/find`) or from a dotted `method` in the body.',
        usage:
            'blong-dev proxy [--server <alias>] [--port 8099] [--target <url>]\n' +
            '                  [--username <user>] [--password <secret>] [--no-login]',
        options: [
            {flag: '--server <alias>', description: 'a server named in .blong_callrc'},
            {flag: '--port <n>', description: 'the port the proxy listens on (default 8099)'},
            {flag: '--target <url>', description: 'the gateway to front, overriding the file'},
            {flag: '--username <user>', description: 'login name (falls back to $MLE_USERNAME)'},
            {
                flag: '--password <secret>',
                description: 'login secret (falls back to $MLE_PASSWORD)',
            },
            {
                flag: '--no-login',
                description: 'skip the startup login; login methods travel through the proxy',
            },
        ],
        examples: ['blong-dev proxy --server local --port 8099'],
    },
    {
        name: 'call',
        summary: 'Call one gateway method and print the result',
        description:
            'The same MLE session as `proxy` with the loop removed: resolve which gateway the ' +
            'method belongs to, merge the payload it starts from with what the command line adds, ' +
            "send it, print the result. A failing call exits non-zero with the gateway's message. " +
            'The payload is JSON or YAML; `--payload.<path>=<value>` sets one property and keeps ' +
            'its JSON type.',
        usage:
            'blong-dev call <method> [payload] [--server <alias>] [--payload.<path>=<value>]\n' +
            '                  [--plain] [--dry-run]',
        options: [
            {flag: '--server <alias>', description: 'a server named in .blong_callrc'},
            {
                flag: '--payload.<path>=<value>',
                description: 'set or override one property at a dotted path',
            },
            {
                flag: '--plain',
                description: 'send the params as JSON, for a route the gateway serves without auth',
            },
            {
                flag: '--dry-run',
                description: 'print the method, server and payload instead of sending',
            },
        ],
        examples: [
            "blong-dev call chat.prompt.ask '{platform: slack, kind: text, text: Deploy?}'",
            "blong-dev call access.user.find '{paging: {}}' --payload.paging.pageSize=10",
        ],
        note: 'Servers, routes and payload defaults come from .blong_callrc (see docs/blong/docs/patterns/blong-dev.md).',
    },
    {
        name: 'trace',
        summary: 'Print a Playwright trace as an action timeline',
        description:
            'Extracts the action events and the network snapshots from a trace and prints the ' +
            'timeline plus the requests that failed — the failure a trace captures and a ' +
            'screenshot does not.',
        usage: 'blong-dev trace <trace.zip|dir>',
        examples: ['blong-dev trace .playwright/results/my-test/trace.zip'],
    },
    {
        name: 'log',
        summary: 'Read the log entries persisted on disk',
        description:
            'Exposes on the command line the entries the transport wrote to disk (default ' +
            '`~/.blong/log-cache`, `$BLONG_LOG_CACHE` to move it), which is what makes a log line ' +
            'from a run that has already finished recoverable. A ULID prints one entry in full ' +
            '(as JSON); without one, recent entries are listed in a compact form that is safe to ' +
            'grep. `--output pretty` is the colorized, human-readable form.',
        usage: 'blong-dev log [ulid] [options]',
        options: [
            {
                flag: '--cache-path <path>',
                description: 'the cacache directory (default ~/.blong/log-cache)',
            },
            {flag: '--output <format>', description: 'condensed | pretty | json'},
            {
                flag: '--level <level>',
                description: 'minimum level: trace | debug | info | warn | error | fatal',
            },
            {flag: '--name <name>', description: 'service name (case-insensitive substring)'},
            {flag: '--search <text>', description: 'free text across every entry property'},
            {flag: '--trace-id <id>', description: 'one trace, exactly'},
            {flag: '--method <method>', description: '$meta.method (case-insensitive substring)'},
            {flag: '--after <ulid>', description: 'only entries newer than this id'},
            {flag: '--limit <n>', description: 'how many entries (default 50; 0 = all)'},
            {flag: '--payloads', description: 'include the retained payload blobs'},
            {flag: '--no-color', description: 'no ANSI colors in the pretty output'},
        ],
        examples: [
            'blong-dev log --level error --name gateway --limit 20',
            'blong-dev log 01J8Z6...',
        ],
    },
    {
        name: 'sql',
        summary: 'Run a SQL query against the development database',
        description:
            'Opens a MySQL connection resolved from `.blong_devrc` (found in the current directory ' +
            'or above it, or in the home directory; the key defaults to `srv.db.knex.connection`), ' +
            'falling back to the shared dev defaults and deriving the database as `<suite>-<user>`. ' +
            'Several `;`-separated statements run in one round trip. JSON is the default off a TTY, ' +
            'which is what makes it usable from an agent.',
        usage: 'blong-dev sql "<query>" [--config <key>] [--output json|pretty] [--database <name>] [--no-color]',
        options: [
            {
                flag: '--config <key>',
                description: 'the .blong_devrc key to read (default srv.db.knex.connection)',
            },
            {flag: '--output <format>', description: 'json | pretty (default: json off a TTY)'},
            {flag: '--database <name>', description: 'the database to use'},
            {flag: '--host/--port/--user/--password', description: 'override the connection'},
        ],
        examples: [
            'blong-dev sql "SELECT * FROM access_role"',
            'blong-dev sql "SELECT 1" --output json',
        ],
    },
    {
        name: 'db',
        summary: 'Back a database up as a zip, or list the databases',
        description:
            'Dumps tables, views and rows through the same connection as `sql` — no mysqldump, no ' +
            'kubectl exec — and writes one `.zip` into a predefined host folder, so the next person ' +
            'or session finds it without being told.',
        helpOnBare: true,
        verbs: [
            {
                name: 'backup',
                summary: 'Dump one database (or --all) into a zip',
                usage: 'blong-dev db backup [--database <name> | --all] [--output <dir>] [--config <key>]',
                description:
                    'The archive lands in `--output`, else `$BLONG_BACKUP_DIR`, else `backup.path` ' +
                    'in `.blong_devrc`, else `dev/backup` beside `rush.json` — the folder a k3d node ' +
                    'can mount as a local-path volume. Take one before a schema change or a seed ' +
                    're-run. Tables, views and rows only: no routines, triggers or events.',
                options: [
                    {
                        flag: '--database <name>',
                        description: 'the database to dump (default: the derived dev name)',
                    },
                    {flag: '--all', description: 'every non-system database'},
                    {flag: '--output <dir>', description: 'the folder to write into'},
                    {flag: '--config <key>', description: 'the .blong_devrc key, as for sql'},
                ],
                examples: [
                    'blong-dev db backup --database blong-sport',
                    'blong-dev db backup --all',
                ],
            },
            {
                name: 'list',
                summary: 'List the databases on the server',
                usage: 'blong-dev db list',
            },
        ],
    },
    {
        name: 'user',
        summary: 'Add, list or re-password access users',
        description:
            'Bootstraps a login straight in a database, which is how a first login is created when ' +
            'no gateway is reachable. The login name is the resource name — `access_user` holds no ' +
            'user name — so `add admin` creates a login called `admin`. Every verb finishes by ' +
            'reading back whether the granted roles reach the `accessLogin` action, because a login ' +
            'can fail away from the record that is missing it.',
        helpOnBare: true,
        verbs: [
            {
                name: 'add',
                summary: 'Create a user with a password and roles',
                usage:
                    'blong-dev user add <userName> --password <secret> [--role <a,b>] [--email <address>]\n' +
                    '                      [--inactive] [--update] [--database <db>] [--config <key>]',
                description:
                    'Writes the `core_resource`, the `access_user` row, the password credential, the ' +
                    '`hasRole` edges and the `access_pathRefresh()` call in one transaction. ' +
                    '`--update` re-applies the roles of a user that already exists.',
                options: [
                    {flag: '--password <secret>', description: "the new user's login secret"},
                    {flag: '--db-password <secret>', description: "the database's own password"},
                    {flag: '--role <a,b>', description: 'roles to grant'},
                    {flag: '--email <address>', description: 'the name the resource carries'},
                    {flag: '--update', description: 'update an existing user instead of refusing'},
                ],
                examples: ['blong-dev user add admin --password change-me --role Admin'],
            },
            {
                name: 'passwd',
                summary: 'Rotate a password the way the realm does',
                usage: 'blong-dev user passwd <userName> --password <newSecret> [--strict] [--force]',
                description:
                    'Deactivates the stored rows and inserts a new active one, so the previous ' +
                    "secret stops working when it commits. A secret below the active policy's " +
                    '`minLength` only warns; `--strict` refuses it and `--force` silences the warning.',
                options: [
                    {flag: '--password <secret>', description: 'the new secret'},
                    {
                        flag: '--strict',
                        description: 'refuse a secret shorter than the policy asks for',
                    },
                    {flag: '--force', description: 'silence the policy warning'},
                ],
            },
            {
                name: 'list',
                summary: 'List users with their roles and whether they can log in',
                usage: 'blong-dev user list [--role <name>] [--output json]',
            },
        ],
        note:
            'The connection resolves as `blong-dev sql` does: .blong_devrc, --config, --database, ' +
            "plus --host/--port/--user/--db-password/--suite. `--password` is the new user's " +
            "secret and `--db-password` the database's. A secret shorter than the active policy " +
            'warns unless --strict (refuse) or --force (quiet).',
    },
    {
        name: 'cspell',
        summary: 'Write and validate the cspell dictionary',
        description:
            'Owns the two lists a person appends to in `cspell.config.yaml` — `words` and ' +
            '`ignorePaths` — and the insertion point that makes editing them by hand expensive. ' +
            'Nothing else in the file is touched, and a run that changes nothing writes nothing.',
        helpOnBare: true,
        options: [
            {flag: '--section <name>', description: 'words | ignorePaths | ignoreRegExpList'},
            {flag: '--file <path>', description: 'a config other than the nearest one found'},
        ],
        verbs: [
            {
                name: 'add',
                summary: 'Insert words where they belong',
                usage: 'blong-dev cspell add <word...> [--section <name>] [--file <path>]',
                description:
                    'Inserts each word in sorted position and reports one the list already has.',
                options: [
                    {
                        flag: '--section <name>',
                        description: 'words (default) | ignorePaths | ignoreRegExpList',
                    },
                    {
                        flag: '--file <path>',
                        description: 'a config other than the nearest one found',
                    },
                ],
                examples: ['blong-dev cspell add kukum mxbai'],
            },
            {
                name: 'remove',
                summary: 'Remove words from a list',
                usage: 'blong-dev cspell remove <word...> [--section <name>] [--file <path>]',
            },
            {
                name: 'sort',
                summary: 'Put a drifted list back in order',
                usage: 'blong-dev cspell sort [--check] [--section <name>] [--file <path>]',
            },
            {
                name: 'check',
                summary: 'Fail when a list is not sorted (the gate)',
                usage: 'blong-dev cspell check [--section <name>] [--file <path>]',
            },
            {
                name: 'list',
                summary: 'Print a list',
                usage: 'blong-dev cspell list [--section <name>] [--file <path>]',
            },
        ],
    },
    {
        name: 'publish',
        summary: 'Check a published tarball against its entry points',
        description:
            "Fails when a package's published tarball would omit an entry point its package.json " +
            'declares — the mistake that only surfaces in the consumer.',
        usage: 'blong-dev publish check [--root <path>] [--json]',
        options: [
            {flag: '--root <path>', description: 'the package to check (default: the current one)'},
        ],
        examples: ['blong-dev publish check'],
    },
    {
        name: 'glossary',
        summary: 'Write and validate the documentation glossary',
        description:
            'Owns the vocabulary page: `add` inserts a term in sorted position and wraps its ' +
            'definition, and `check` is the gate for an unsorted or repeated term, a definition ' +
            'over forty words, or a link that does not resolve. Only the region between the ' +
            'markers is touched.',
        helpOnBare: true,
        verbs: [
            {
                name: 'add',
                summary: 'Insert a term and its definition',
                usage: 'blong-dev glossary add <term> --definition "<sentence>" [--file <path>]',
                description: 'One term, one sentence, one link to the page that explains it.',
                options: [
                    {
                        flag: '--definition <text>',
                        description: 'the sentence; replaced when the term exists',
                    },
                    {flag: '--file <path>', description: 'another glossary file'},
                ],
                examples: [
                    'blong-dev glossary add adapter --definition "A component that hides the protocol an external system speaks."',
                ],
            },
            {
                name: 'remove',
                summary: 'Remove terms',
                usage: 'blong-dev glossary remove <term...> [--file <path>]',
            },
            {
                name: 'list',
                summary: 'List the terms',
                usage: 'blong-dev glossary list [--json] [--file <path>]',
            },
            {
                name: 'show',
                summary: 'Show one term and its definition',
                usage: 'blong-dev glossary show <term> [--json] [--file <path>]',
            },
            {
                name: 'sort',
                summary: 'Put a drifted glossary back in order',
                usage: 'blong-dev glossary sort [--check] [--file <path>]',
            },
            {
                name: 'check',
                summary: 'Fail on an unsorted entry, a long definition or a dead link',
                usage: 'blong-dev glossary check [--json] [--file <path>]',
            },
        ],
    },
    {
        name: 'memory',
        summary: 'Write and validate the agent memory files',
        description:
            'The writer and validator of the memory format: it owns the ids, the section an entry ' +
            'belongs in, the 100-column wrapping and the generated index, so a memory file stays ' +
            'consistent without anyone remembering the format. Every write also pushes the entry ' +
            'into a local semantic index, which is what `search` reads; the markdown stays the ' +
            'source of truth. `check` is the gate, and it is wired into the staged-file lint.',
        helpOnBare: true,
        verbs: [
            {
                name: 'add',
                summary: 'Append an entry of a kind',
                usage:
                    'blong-dev memory add <friction|todo|decision|faq> --title <title> [--area <area>]\n' +
                    '                         [--body <text>|--body-file <file>] [--status <status>]\n' +
                    '                         [--id <id>] [--plan <file|slug>]',
                description:
                    'Writes one entry with the next id of its file, in the section its status names. ' +
                    'Write the body to a file and use `--body-file` when it carries backticks: bash ' +
                    'substitutes them inside a double-quoted `--body`. `--plan` lists a decision or ' +
                    "friction on the plan's decisions-and-frictions section.",
                options: [
                    {
                        flag: '--title <title>',
                        description: 'one line naming the entry (keep it under ~70 characters)',
                    },
                    {
                        flag: '--area <area>',
                        description: 'the package or reserved area, e.g. core/blong-browser',
                    },
                    {
                        flag: '--body-file <file>',
                        description: 'the body, as prose (a list is flattened)',
                    },
                    {
                        flag: '--plan <file|slug>',
                        description: 'list it on the plan (decision and friction)',
                    },
                ],
                examples: [
                    'blong-dev memory add friction --title "<what cost the effort>" --area ci --body-file /tmp/body.md',
                ],
            },
            {
                name: 'list',
                summary: 'List entries with their ids and status',
                usage: 'blong-dev memory list [--kind <kind>] [--area <area>] [--status <status>] [--search <text>] [--json]',
                description:
                    'The cheap way to see what a file already holds, without reading the file.',
            },
            {
                name: 'show',
                summary: 'Print one entry',
                usage: 'blong-dev memory show <id|id@scope> [--json]',
            },
            {
                name: 'edit',
                summary: 'Correct an entry through the CLI',
                usage: 'blong-dev memory edit <id|id@scope> [--title <title>] [--body-file <file>] [--status <status>]',
                description:
                    'Never hand-edit a memory file, and never re-import a batch already written.',
            },
            {
                name: 'close',
                summary: 'Give an entry its terminal status',
                usage: 'blong-dev memory close <id|id@scope> [--note <text>] [--by <id>] [--reason <text>] [--plan <file>] [--no-plan]',
                description:
                    'A friction becomes resolved, a todo done, a decision superseded by the ' +
                    '`--by`/`--reason` it names; `--note` says what the outcome was. The entry and ' +
                    'its body stay, because the reasoning outlives the status. It ticks the ' +
                    "plan's box through the entry's reference. A question is closed by " +
                    '`memory answer`, not here.',
                options: [
                    {flag: '--note <text>', description: 'what the outcome was'},
                    {flag: '--by <id>', description: 'the successor of a superseded decision'},
                    {flag: '--reason <text>', description: 'why a decision was superseded'},
                    {flag: '--no-plan', description: 'do not tick the plan'},
                ],
                examples: ['blong-dev memory close T-345 --note "landed in the release build"'],
            },
            {
                name: 'retire',
                summary: 'Remove an entry that should not be in the files',
                usage: 'blong-dev memory retire <id|id@scope> [--reason <text>] [--purge]',
            },
            {
                name: 'reopen',
                summary: 'Put a closed entry back to open',
                usage: 'blong-dev memory reopen <id|id@scope>',
            },
            {
                name: 'renumber',
                summary: 'Move an entry to another id',
                usage: 'blong-dev memory renumber <id|id@scope> --to <id>',
            },
            {
                name: 'comply',
                summary: 'Report sites citing an entry this change touched',
                usage: 'blong-dev memory comply [--since <ref>] [--json]',
            },
            {
                name: 'move',
                summary: 'File an entry under another area',
                usage: 'blong-dev memory move <id|id@scope>[,<id>...] --area <area>',
            },
            {
                name: 'index',
                summary: 'Rebuild the generated index and the semantic index',
                usage: 'blong-dev memory index [--check] [--files <a,b>] [--semantic] [--dry-run] [--sources <entry,docs,skill>]',
            },
            {
                name: 'search',
                summary: 'Find entries by meaning',
                usage: 'blong-dev memory search <query> [--source entry|docs|skill] [--kind <kind>] [--area <area>] [--limit <n>] [--no-record] [--json]',
                description:
                    'A semantic question. It is recorded as an `faq` entry, so answer it once the ' +
                    'hits are read (`memory answer`); `--no-record` skips the recording.',
                examples: ['blong-dev memory search "why do agents edit memory files by hand"'],
            },
            {
                name: 'answer',
                summary: 'Answer a recorded question with its evidence and certainty',
                usage: 'blong-dev memory answer <id|id@scope> --answer <text>|--answer-file <file> --certainty <n|low|medium|high> [--note <text>] [--confirmed <what checked it>]',
                description:
                    'The prose cites `@@F-...` or `@@doc:...` instead of repeating the reasoning.',
            },
            {
                name: 'confirm',
                summary: 'Record what checked an answer',
                usage: 'blong-dev memory confirm <id|id@scope> [--note <what confirmed it>]',
            },
            {
                name: 'merge',
                summary: 'Fold a duplicate question into its keeper',
                usage: 'blong-dev memory merge <keep> <id|id@scope>[,<id>...] [--reason <text>]',
            },
            {
                name: 'format',
                summary: 'Rewrite what the formatter can fix',
                usage: 'blong-dev memory format [--check] [--files <a,b>]',
            },
            {
                name: 'check',
                summary: 'Validate the memory files and their references',
                usage: 'blong-dev memory check [--files <a,b>] [--json] [--no-spell] [--refs]',
                description:
                    'The gate: the format, the wrapping, the index, and every reference into and out of the files.',
            },
            {
                name: 'manual',
                summary: "Read or change the user's own Manual list",
                usage: 'blong-dev memory manual <list|add <text>|done <n|text>>',
            },
            {
                name: 'audit',
                summary: 'Find the questions that ask nearly the same thing',
                usage: 'blong-dev memory audit [--json]',
            },
            {
                name: 'refs',
                summary: 'Lint and audit the @@ references',
                usage: 'blong-dev memory refs [<id|doc:page|skill:name>...] [--dangling] [--sites] [--changed] [--summary] [--json]',
                examples: ['blong-dev memory refs --dangling', 'blong-dev memory refs --sites'],
            },
            {
                name: 'export',
                summary: 'Write the index the editor reads',
                usage: 'blong-dev memory export [--out <file>]',
            },
            {
                name: 'migrate',
                summary: 'Bring a legacy file into the memory format',
                usage: 'blong-dev memory migrate <file> --kind <kind> [--drop <file>] [--apply]',
            },
            {
                name: 'import',
                summary: 'Import a batch of entries',
                usage: 'blong-dev memory import <file.json> [--kind <kind>] [--apply] [--force]',
            },
            {
                name: 'prune',
                summary: 'Delete entries and their index documents',
                usage: 'blong-dev memory prune <id,id> --reason "<why>" [--force] [--purge]',
            },
        ],
        note: 'The file format and the workflow around it: docs/blong/docs/patterns/memory.md and the blong-plan skill.',
    },
    {
        name: 'plan',
        summary: 'Run a plan: its tasks, issue and channel',
        description:
            'A plan is a board, not a document: the work breakdown is `- [ ] <title> · area: <area>` ' +
            'with the detail indented below it. `tasks` moves that detail into memory and leaves ' +
            'the titles and their references behind; `init` also mirrors the plan into a GitHub ' +
            'issue and opens its Slack channel; `sync` repairs the board from what the memory says.',
        helpOnBare: true,
        verbs: [
            {
                name: 'check',
                summary: 'Parse the work breakdown and report what would not create',
                usage: 'blong-dev plan check <plan> [--area <default>] [--json]',
            },
            {
                name: 'tasks',
                summary: 'Create one memory todo per task',
                usage: 'blong-dev plan tasks <plan> [--apply] [--update] [--area <default>] [--slug <slug>]',
                description: 'A dry run is the default; `--apply` writes.',
            },
            {
                name: 'init',
                summary: 'Approve the plan: tasks, issue and Slack channel',
                usage: 'blong-dev plan init <plan> [--repo <owner/name>] [--label plan] [--invite <userId,...>] [--dry-run]',
                description: "Records the issue and the channel in the plan's front matter.",
                examples: ['blong-dev plan init agent --repo feasibleone/blong --invite U123'],
            },
            {
                name: 'sync',
                summary: 'Tick the plan and republish the issue from the memory',
                usage: 'blong-dev plan sync <plan> [--no-issue] [--comment] [--channel] [--check] [--json]',
            },
            {
                name: 'status',
                summary: 'Print the progress line, with the issue and channel links',
                usage: 'blong-dev plan status <plan> [--json]',
            },
            {
                name: 'adopt',
                summary: 'Put existing work under the plan',
                usage: 'blong-dev plan adopt <plan> <id...> [--issue <url|number>]',
            },
        ],
        note: '<plan> is a file, a folder under plans/, or the folder name (e.g. `agent`). See the blong-plan skill.',
    },
    {
        name: 'docs',
        summary: 'Write and validate the generated docs artefacts',
        description:
            'Some pages are generated rather than written: sequence diagrams from a real run, ' +
            'screenshots captured by Playwright, architecture diagrams drawn from the live registry. ' +
            'The register is `docs/blong/docs-artifacts.json`; `check` is the gate and proves an ' +
            'artefact is not stale without leaving a dirty tree.',
        helpOnBare: true,
        verbs: [
            {
                name: 'list',
                summary: 'List the register and whether each destination exists',
                usage: 'blong-dev docs list [--json]',
            },
            {
                name: 'generate',
                summary: 'Run the generators and write the artefacts',
                usage: 'blong-dev docs generate [--only <id[,id]>] [--filter <glob>] [--dry-run]',
            },
            {
                name: 'check',
                summary: 'Regenerate, compare and restore; non-zero when stale',
                usage: 'blong-dev docs check [--only <id[,id]>] [--filter <glob>]',
            },
            {
                name: 'verify',
                summary: 'Build and serve the site and load every page in Chromium',
                usage: 'blong-dev docs verify [--base <url>] [--filter <glob>] [--json]',
                description:
                    'Reports the diagrams and images it expected against those that rendered.',
            },
            {
                name: 'storybook',
                summary: 'Refresh the embedded Storybook builds',
                usage: 'blong-dev docs storybook [--only <name[,name]>] [--no-build] [--dry-run]',
            },
            {
                name: 'diagram',
                summary: 'Redraw the architecture diagrams',
                usage: 'blong-dev docs diagram [--only <slug[,slug]>] [--archify <path>] [--dry-run] [--no-posters]',
            },
            {
                name: 'serve',
                summary: 'Serve the built site locally',
                usage: 'blong-dev docs serve [--port <port>] [--dir <path>]',
            },
        ],
    },
];
