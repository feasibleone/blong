# Browser Compatibility

## Stream A — blong-gogo browser compatibility

### Context

`blong-gogo` already has an `adapter/browser/` split — `adapter/browser.ts` is the browser realm
and `adapter/browser/http.ts` is the HTTP adapter. But `http.ts` currently uses `got`, which is
Node.js-only (uses `http`/`https`/`tls` built-ins internally). The fix is a straight swap to `ky`,
which is already a listed dependency and is fetch-based (runs in Node.js and browsers).

There is also a secondary issue: `http.ts` imports `../../tls.ts`, which calls `readFileSync` to
load cert/key/ca files from disk. Browser TLS is opaque to JS, so the `tls` helper cannot run in a
browser. The browser adapter must not call it.

Static analysis can identify the known server-only symbols, but transitive dependency problems
(e.g. a package pulling in `path` or `stream` through a non-obvious import graph) are much faster
to discover by running the code in a real browser. The fast feedback loop in Task A-5 is the
primary verification mechanism; Tasks A-1 through A-4 are the fixes driven by what that loop
surfaces.

### Current state of `adapter/browser/http.ts`

```ts
import got, {type HttpsOptions, type Options} from 'got';
import tls from '../../tls.ts';

// ...in init():
https = tls(this.config, true);

// ...in exec():
const result = await got({
    url,
    searchParams,
    https,         // ← Node TLS options, ignored by fetch anyway
    method: ...,
    headers,
    responseType,
    body,
    form,
    json,
    throwHttpErrors: false,
    followRedirect: false,
    isStream: !!stream,
});
```

### Task A-1 — rewrite `adapter/browser/http.ts` using `ky`

**What to change:**

1. Remove `got` import, remove `tls` import, remove the `https` field on the class.
2. Replace `init()` body with `super.init(...configs)` only (no TLS setup).
3. Rewrite `exec()` using `ky`. Key API differences:

| got                                  | ky equivalent                                        |
| ------------------------------------ | ---------------------------------------------------- |
| `got({url, json, method, headers})` | `ky(url, {json, method, headers})` or `ky.post(...)` |
| `throwHttpErrors: false`            | `throwHttpErrors: false`                             |
| `followRedirect: false`             | `redirect: 'manual'`                                 |
| `isStream: true`                    | not supported by ky — omit `stream` path             |
| `.statusCode`, `.statusMessage`     | `.status`, `.statusText` on `Response`               |
| `.headers` as `Record<string,unknown>` | `.headers` (Headers object) — spread to plain obj |
| `body` (Buffer/string)              | `body` (BodyInit) — pass through                     |
| `form` (URLSearchParams)            | `body: new URLSearchParams(form)`                    |
| `searchParams`                      | `searchParams` — same                                |
| `responseType: 'json'`             | `.json()` call on response                           |
| `responseType: 'buffer'`           | `.arrayBuffer()`                                     |
| `responseType: 'text'`             | `.text()`                                            |

**Target implementation sketch:**

```ts
import ky, {type Options as KyOptions} from 'ky';
import {adapter} from '@feasibleone/blong/types';
import type {Errors, IErrorMap, IMeta} from '@feasibleone/blong/types';

export interface IConfig {
    url?: string;
}

const errorMap: IErrorMap = {'http.generic': 'HTTP Error'};
let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);
    return {
        activation: {default: {type: 'http'}},
        async init(...configs: object[]) {
            await super.init(...configs);
        },
        start() {
            super.connect();
            return super.start();
        },
        async exec({path, query: searchParams, url = new URL(path, this.config.url), responseType, method, headers, body, form, json}: {
            path: string;
            query: string | Record<string, string>;
            url: URL;
            responseType: 'json' | 'text' | 'buffer';
            method: string;
            headers: Record<string, string>;
            body: BodyInit;
            form: Record<string, string>;
            json: unknown;
        }, _meta: IMeta) {
            try {
                this.log.debug?.({req: {method: (method || 'POST').toUpperCase(), url, headers, body, json}});
                const kyOptions: KyOptions = {
                    method: method || 'POST',
                    headers,
                    throwHttpErrors: false,
                    redirect: 'manual',
                    ...(json != null ? {json} : {}),
                    ...(form != null ? {body: new URLSearchParams(form as Record<string,string>)} : {}),
                    ...(body != null && json == null && form == null ? {body} : {}),
                    ...(searchParams != null ? {searchParams: searchParams as Record<string,string>} : {}),
                };
                const res = await ky(url.toString(), kyOptions);
                // Normalise to got-like shape so existing codec handlers don't need to change
                const resolvedBody = responseType === 'buffer'
                    ? await res.arrayBuffer()
                    : responseType === 'text'
                    ? await res.text()
                    : await res.json().catch(() => null);
                const result = {
                    statusCode: res.status,
                    statusMessage: res.statusText,
                    headers: Object.fromEntries(res.headers.entries()),
                    body: resolvedBody,
                };
                this.log.debug?.({req: {url, method: (method || 'POST').toUpperCase()}, res: result});
                return result;
            } catch (error) {
                throw _errors['http.generic'](error);
            }
        },
    };
});
```

**Notes:**

- Stream responses (`isStream`) are not supported by `fetch`/`ky`. If the browser adapter ever needs
  them, use the Fetch Streams API (`res.body` readable stream) in a separate path. For now: drop the
  `stream`/`isStream` branch.
- `ky` v1 returns a `KyResponse` (extends `Response`). The normalised shape above keeps it
  compatible with the existing codec layer which reads `.statusCode`, `.statusMessage`, `.headers`,
  `.body`.

### Task A-2 — add `browser` export condition in `package.json`

Currently the package exports map is:

```json
{
  ".": "./src/load.ts",
  "./ConfigRuntime.js": "./src/ConfigRuntime.ts"
}
```

`load.ts` uses `fs`, `fs/promises`, `path`, `node:module`. It must never be bundled for browser.

The browser-side code only needs the adapter realm (`adapter/browser.ts`) to register itself. Add a
condition to let bundlers (Vite/Rollup) select a browser-safe entry automatically:

```json
{
  ".": {
    "browser": "./src/browser.ts",
    "import": "./src/load.ts"
  },
  "./browser": "./src/adapter/browser.ts",
  "./ConfigRuntime.js": "./src/ConfigRuntime.ts"
}
```

### Task A-3 — create `src/browser.ts` (browser entry)

This file is the browser-safe public API of blong-gogo. It must not import anything that pulls in
`fs`, `path`, `node:module`, `fastify`, `pino`, `knex`, `mongodb`, etc.

```ts
// src/browser.ts
// Browser-safe entry — used by bundlers via the "browser" exports condition.
// Server-only features (load, scan, Watch, RpcServer, Gateway, Log, adapter/server)
// must never appear here.
export {default as browserRealm} from './adapter/browser.ts';
```

This is intentionally minimal. The consuming suite (blong-ui's browser platform) loads the realm
directly; it doesn't need the full server bootstrap or any adapter other than the HTTP one.

### Task A-4 — verify no server imports leak into browser bundle

After A-1 through A-3, build `blong-ui` with its existing Vite config and check the bundle output:

```bash
cd core/blong-ui
node ../../common/scripts/install-run-rush-pnpm.js run --to @feasibleone/blong-ui -- build
# check the dist output for tell-tale server-only strings:
grep -r "readFileSync\|createRequire\|fastify" dist/ || echo "Clean"
```

If any server import leaks, use `build.rollupOptions.external` or `resolve.conditions: ['browser']`
in `vite.config.ts` to enforce the right condition.

A subtler problem is the `defKind`-based conditional in `load.ts`:

```ts
...({
    server: [...server-only imports...],
    browser: [...browser-only imports...],
}[defKind] ?? [])
```

Because `defKind` is a runtime value, Rollup cannot statically tree-shake the server branch. This
means `fastify`, `pino`, `knex`, etc. will all end up in the browser bundle even if they are never
executed. The fix is to replace the dynamic property access with a static `if/else` so Rollup can
do dead-code elimination:

```ts
// Before (Rollup cannot tree-shake):
...({server: [...], browser: [...]}[defKind] ?? [])

// After (Rollup eliminates whichever branch is not taken):
if (defKind === 'browser') {
    items.push(
        function remote() { return import('./Remote.ts'); },
        function registry() { return import('./Registry.ts'); },
        function codec() { return import('./codec/browser.ts'); },
        function orchestrator() { return import('./orchestrator/index.ts'); },
        function adapter() { return import('./adapter/browser.ts'); },
    );
} else {
    items.push(
        function remote() { return import('./RpcClient.ts'); },
        function rpcServer() { return import('./RpcServer.ts'); },
        function gateway() { return import('./Gateway.ts'); },
        function restFs() { return import('./RestFs.ts'); },
        function registry() { return import('./Registry.ts'); },
        function codec() { return import('./codec/server.ts'); },
        function orchestrator() { return import('./orchestrator/index.ts'); },
        function adapter() { return import('./adapter/server.ts'); },
    );
}
```

This change is mechanical and does not alter runtime behavior, but allows the browser bundle to
completely exclude the server block at build time.

---

### Task A-5 — browser-compatible logger (`src/BrowserLog.ts`)

`load.ts` always loads `./Log.ts` as the first item, regardless of kind. The server `Log.ts` uses
pino's `transport` option, which spawns a worker thread via Node.js `worker_threads` — completely
incompatible with browsers.

Pino has a built-in `browser` mode that sidesteps transports entirely and calls user-supplied
`write` functions. Use it to implement a `BrowserLog` that outputs color-formatted lines to
`console.*`, inspired by
[ut-log/consoleStream.js](https://github.com/softwaregroup-bg/ut-log/blob/master/consoleStream.js).

**Key design decisions aligning with that reference:**

| ut-log consoleStream concept             | BrowserLog implementation                     |
| ---------------------------------------- | --------------------------------------------- |
| Level → CSS color map                   | Same palette, kept as a `const`               |
| `%c` format string with color arguments | Same `console.log('%c...', css, ...)` pattern |
| `nameFromLevel` padded to fixed width   | Identical — pads to 5 chars                   |
| `logByLevel` → routes to `console.warn` etc. | Same `logByLevel` option                 |
| `rec.service`, `rec.name`, `rec.mtid`   | Same fields extracted from pino record        |
| `details` = all fields not in `skip`    | Same skip list                                |
| Extra `console.error(rec.error)` call   | Preserved — shows stack in devtools           |

**`src/BrowserLog.ts`:**

```ts
import {Internal, type ILog} from '@feasibleone/blong/types';
import {pino, type Level, type Logger, type LoggerOptions} from 'pino';

// ── level constants (pino uses numeric levels matching bunyan) ──────────────
const TRACE = 10, DEBUG = 20, INFO = 30, WARN = 40, ERROR = 50, FATAL = 60;

const nameFromLevel: Record<number, string> = {
    [TRACE]: 'trace', [DEBUG]: 'debug', [INFO]: 'info',
    [WARN]: 'warn', [ERROR]: 'error', [FATAL]: 'fatal',
};

const LEVEL_CSS: Record<string, string> = {
    trace: 'color: grey',
    debug: 'color: blue',
    info:  'color: cyan',
    warn:  'color: magenta',
    error: 'color: red',
    fatal: 'color: red; font-weight: bold',
};
const DEFAULT_CSS = {
    def:     'color: black',
    msg:     'color: darkblue',
    service: 'color: darkorange',
    mtid:    'color: Magenta',
    src:     'color: DimGray; font-style: italic; font-size: 0.9em',
};

// Fields written separately; everything else goes into the `details` object
const SKIP = new Set([
    'name', 'hostname', 'pid', 'level', 'component', 'msg', 'time', 'v',
    'src', 'error', 'clientReq', 'clientRes', 'req', 'res',
    '$meta', 'mtid', 'jsException', 'service',
]);

export interface IBrowserLogConfig {
    level?: Level;
    /** Route each log call to the matching console.warn / console.error etc.
     *  instead of always using console.log. Default: false */
    logByLevel?: boolean;
}

function write(rec: Record<string, unknown>, logByLevel: boolean): void {
    const level = rec.level as number;
    const levelKey = nameFromLevel[level] ?? 'info';
    const paddedLevel = levelKey.toUpperCase().padStart(5);

    // Choose the console method
    let consoleMethod: (...a: unknown[]) => void = console.log; // eslint-disable-line
    if (logByLevel) {
        const mapped = level <= TRACE ? 'debug' : level >= FATAL ? 'error' : levelKey;
        consoleMethod = (typeof (console as Record<string, unknown>)[mapped] === 'function'
            ? (console as Record<string, (...a: unknown[]) => void>)[mapped]
            : console.log); // eslint-disable-line
    }

    const levelCss =
        level < DEBUG ? LEVEL_CSS.trace :
        level < INFO  ? LEVEL_CSS.debug :
        level < WARN  ? LEVEL_CSS.info  :
        level < ERROR ? LEVEL_CSS.warn  :
        level < FATAL ? LEVEL_CSS.error : LEVEL_CSS.fatal;

    // any fields not in the skip list become the expandable details object
    const details: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
        if (v != null && !SKIP.has(k)) details[k] = v;
    }
    const hasDetails = Object.keys(details).length > 0;

    const loggerName = rec.childName
        ? `${rec.name}/${rec.childName}`
        : (rec.name as string | undefined) ?? '';

    const time = rec.time instanceof Date
        ? rec.time.toISOString().slice(11, 23)
        : new Date().toISOString().slice(11, 23);

    const label =
        (rec.$meta as Record<string, string> | undefined)?.method ??
        (rec.$meta as Record<string, string> | undefined)?.opcode ??
        (rec.msg as string | undefined) ?? '';

    const fmt = `[%s] %c%s%c %s%c %s: %c%s %c%s${hasDetails ? ' %c%o' : ''}`;
    const args: unknown[] = [
        fmt,
        time,
        levelCss,    paddedLevel,
        DEFAULT_CSS.service,  rec.service ?? '',
        DEFAULT_CSS.def,      loggerName,
        DEFAULT_CSS.mtid,     (rec.mtid as string | undefined) ?? '',
        DEFAULT_CSS.msg,      label,
    ];
    if (hasDetails) args.push(DEFAULT_CSS.src, details);

    consoleMethod(...args);

    if (rec.error && (rec.error as {stack?: string}).stack)
        console.error(rec.error); // eslint-disable-line
}

export default class BrowserLog extends Internal implements ILog {
    #logger: Logger;
    #config: IBrowserLogConfig = {level: 'info', logByLevel: false};

    public constructor(config: IBrowserLogConfig) {
        super();
        this.merge(this.#config, config);
        const logByLevel = this.#config.logByLevel ?? false;
        this.#logger = pino({
            level: this.#config.level ?? 'info',
            browser: {
                asObject: true,
                write: (rec: Record<string, unknown>) => write(rec, logByLevel),
            },
        });
    }

    public child<T extends string>(...params: Parameters<Logger<never>['child']>): Logger<T> {
        return this.#logger.child(...params) as Logger<T>;
    }

    public logger(
        level: LoggerOptions['level'] = this.#config.level,
        bindings: object,
    ): ReturnType<ILog['logger']> {
        const child = this.#logger.child(bindings, {level});
        const result = {trace: null, debug: null, info: null, warn: null, error: null, fatal: null};
        switch (level) {
            case 'trace':  result.trace  = child.trace.bind(child);  // fallthrough
            case 'debug':  result.debug  = child.debug.bind(child);  // fallthrough
            case 'info':   result.info   = child.info.bind(child);   // fallthrough
            case 'warn':   result.warn   = child.warn.bind(child);   // fallthrough
            case 'error':  result.error  = child.error.bind(child);  // fallthrough
            case 'fatal':  result.fatal  = child.fatal.bind(child);
        }
        return result;
    }
}
```

**Wire it into `load.ts`** — change the `log` item loader to switch on kind:

```ts
// Before
function log() { return import('./Log.ts'); }

// After
function log() {
    return defKind === 'browser' ? import('./BrowserLog.ts') : import('./Log.ts');
}
```

This is a two-line local change; no interface changes needed.

---

### Task A-6 — fast feedback loop in a real browser

Static analysis and bundle-grep (Tasks A-1 to A-4) catch what you can see. A real browser catches
everything else: transitive Node.js built-in polyfill warnings, missing globals, runtime errors
from code paths that look fine statically but fail at runtime.

**Setup — one-time:**

```bash
# 1. Install Playwright (if not already present in the monorepo)
cd /home/kalin/work/blong/blong
node common/scripts/install-run-rush-pnpm.js add --package playwright --dev --caret

# 2. Install the browser binaries
npx playwright install chromium
```

**The iteration script — `scripts/browser-compat-check.mjs`:**

Create this script at the root of the blong-gogo package:

```js
// core/blong-gogo/scripts/browser-compat-check.mjs
//
// Usage:
//   node scripts/browser-compat-check.mjs
//
// Starts the ui-demo/marine Vite dev server, opens Chromium via Playwright,
// captures ALL console output and network errors, prints a summary, and exits.
// Run after every code change. Exit code 1 if errors were found.

import {chromium} from 'playwright';
import {spawn} from 'child_process';

const VITE_URL = 'http://localhost:5173';
const TIMEOUT_MS = 30_000;

async function startVite() {
    const proc = spawn('node', ['../../common/scripts/install-run-rush-pnpm.js', 'run', 'dev'], {
        cwd: new URL('../../../ui-demo/marine', import.meta.url).pathname,
        stdio: 'pipe',
    });
    // Wait until Vite prints its "ready" line
    await new Promise((resolve, reject) => {
        const onData = chunk => {
            if (chunk.toString().includes('Local:')) resolve(proc);
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
        setTimeout(() => reject(new Error('Vite did not start in time')), TIMEOUT_MS);
    });
    return proc;
}

async function run() {
    console.log('Starting Vite dev server…');
    const vite = await startVite();

    const browser = await chromium.launch();
    const page = await browser.newPage();

    const errors = [];
    const warnings = [];

    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error')   errors.push(text);
        if (type === 'warning') warnings.push(text);
        // print everything so the agent log shows real-time output
        console.log(`[browser:${type}] ${text}`);
    });

    page.on('pageerror', err => {
        errors.push(`UNCAUGHT: ${err.message}`);
        console.error(`[browser:pageerror] ${err.message}`);
    });

    page.on('requestfailed', req => {
        const msg = `REQUEST FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`;
        errors.push(msg);
        console.error(`[browser:request] ${msg}`);
    });

    console.log(`Navigating to ${VITE_URL} …`);
    await page.goto(VITE_URL, {waitUntil: 'networkidle', timeout: TIMEOUT_MS});

    // Give async framework init a moment to complete
    await page.waitForTimeout(3000);

    await browser.close();
    vite.kill();

    console.log('\n─── Summary ───────────────────────────────────');
    console.log(`Errors:   ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);
    if (errors.length) {
        console.error('\nErrors found:');
        errors.forEach(e => console.error('  •', e));
        process.exit(1);
    } else {
        console.log('\n✓ No browser errors detected.');
    }
}

run().catch(err => { console.error(err); process.exit(1); });
```

Add a convenience script to `blong-gogo/package.json`:

```json
"scripts": {
    "browser-check": "node scripts/browser-compat-check.mjs"
}
```

**Copilot agent iteration workflow:**

```
1. Make a change (e.g. A-1: replace got with ky in http.ts)
2. Run:  cd core/blong-gogo && node scripts/browser-compat-check.mjs
3. Read the [browser:error] lines in the output
4. Identify the root cause (transitive dep? missing polyfill? wrong import?)
5. Fix it. Back to step 2.
6. When exit code is 0 → the browser is clean for this change.
```

**Typical first-run error patterns and fixes:**

| Error pattern in console                              | Likely cause and fix                                            |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `ReferenceError: process is not defined`              | A dep uses `process.env`. Add to `vite.config.ts`: `define: {'process.env': {}}` |
| `Module "fs" has been externalized for browser`       | Something still imports `fs`. Check the import chain with Vite's `--debug` flag |
| `Cannot read properties of undefined (reading 'write')` | A pino transport was loaded. Verify the `BrowserLog` wiring in `load.ts` |
| `TypeError: Class extends value undefined`            | Vite couldn't resolve a circular ESM — add the offender to `build.rollupOptions.external` |
| `net::ERR_BLOCKED_BY_CLIENT` on API calls             | Expected if no server is running — not a compatibility issue |

**Reading the browser DevTools remotely (alternative):**

If the script approach is too heavy for a given iteration, Vite also exposes its HMR websocket.
A lighter option is to build-and-grep after each change:

```bash
cd core/blong-ui
pnpm build 2>&1 | grep -i "could not resolve\|is not exported\|circular"
```

Vite prints unresolved Node.js built-ins during the browser build as `WARN` lines — each one is a
transitive dependency that needs fixing.

### Acceptance criteria for Stream A

- [ ] `adapter/browser/http.ts` has no `got` import, no `tls` import, no `readFileSync` dependency
- [ ] `adapter/browser/http.ts` makes requests using `ky`; response shape matches the existing codec layer expectations
- [ ] `src/BrowserLog.ts` exists; color-formatted log lines appear in browser DevTools console
- [ ] `load.ts` loads `BrowserLog` when `defKind === 'browser'`
- [ ] The `defKind` server/browser split in `load.ts` uses a static `if/else` (not `[defKind]` lookup)
- [ ] `package.json` exports map includes browser condition pointing to `src/browser.ts`
- [ ] `scripts/browser-compat-check.mjs` exits 0 against `ui-demo/marine`
- [ ] `dist/` of `blong-ui` contains no `readFileSync`, `createRequire`, `fastify`
