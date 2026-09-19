/**
 * The package must load under a bare `node`.
 *
 * The package ships as TypeScript and declares no build step, so a consumer
 * imports these `.ts` files directly and the runtime is Node's **strip-only**
 * type removal. Strip-only mode does not transform: a construct that only
 * exists to be compiled away — a parameter property is the one this package
 * hit — is a parse error, `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, and the module
 * (and everything that re-exports it, up to `index.ts`) cannot be imported at
 * all.
 *
 * Neither gate in this repository can see that class of defect. `tap` loads
 * these sources through its SWC-based TypeScript plugin, which *transforms*
 * rather than strips, so the syntax is accepted; and `ci-lint` type-checks with
 * `tsc`, for which a parameter property is valid TypeScript. A green run of
 * either is therefore no evidence at all about the shipped surface. Only
 * starting a real `node` with none of the runner's loader configuration can
 * distinguish the two, which is what every assertion here does.
 *
 * The child is started through `/usr/bin/env -i` for the reason `spawn.test.ts`
 * documents: the runner exports `NODE_OPTIONS` (and the `_TAPJS_PROCESSINFO_*`
 * keys) that install its own import hook, and it patches `child_process` so a
 * child receives them whatever `env` the caller passes. A child that inherited
 * the hook would transform the very syntax this test exists to reject, so the
 * guard would be vacuous. `/usr/bin/env` ignores the forced `NODE_OPTIONS`, and
 * `env -i` then starts the real interpreter with an environment we choose.
 *
 * Each module is **imported**, not run: the child ends with `process.exit(0)`
 * as soon as the import settles. That matters for the two bins —
 * `semantic-log-inspect.ts` would otherwise execute its CLI, and
 * `semantic-log-service.ts` starts a listener. The child's `process.argv` is
 * set before the import for both: `argv[1]` is an existing path that is not the
 * bin, so the inspect entry guard compares unequal and stays inert, and an
 * ephemeral `--port 0` is handed to the service so importing it cannot collide
 * with a real listener. A module whose import never settles is reported by the
 * spawn timeout, not silently passed.
 */

import {execFile} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import t from 'tap';

const run = promisify(execFile);

/** The package root, from this file's own location (`test/`). */
const pkgDir = fileURLToPath(new URL('..', import.meta.url));

/** The one variable the bare interpreter needs. */
const CLEAN_PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;

interface Attempt {
    /**
     * The exit code, or `null` when the process never reached an exit at all
     * (a spawn failure or the timeout kill). `null` is not a code any exit can
     * produce, so it cannot pass as a clean load by accident.
     */
    code: number | null;
    stdout: string;
    stderr: string;
}

/**
 * The package's shipping modules, relative to the package root: every entry
 * point the manifest exports, every source module, the shipped `flow/` fixtures
 * and both `bin` entries. Test files are excluded — they run under `tap`, which
 * transforms, so they are not part of the surface this guard protects.
 *
 * `flow/` is shipped, not test-only (Plan 3 decision 3: the flows are runnable
 * by hand), so it is swept here too. Leaving it out would have shipped a
 * directory of TypeScript that neither gate in this repository can see a
 * strip-only violation in.
 */
function shippingModules(): string[] {
    const sources = readdirSync(join(pkgDir, 'src'), {recursive: true})
        .map(entry => String(entry))
        .filter(entry => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
        .map(entry => `src/${entry}`);
    const flows = readdirSync(join(pkgDir, 'flow'), {recursive: true})
        .map(entry => String(entry))
        .filter(entry => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
        .map(entry => `flow/${entry}`);
    const bins = readdirSync(join(pkgDir, 'bin'))
        .map(entry => String(entry))
        .filter(entry => entry.endsWith('.ts'))
        .map(entry => `bin/${entry}`);
    return ['index.ts', 'emitter.ts', 'service.ts', ...sources, ...flows, ...bins].sort();
}

/** Import one module in a bare-node child, reporting the outcome instead of throwing. */
async function attempt(module: string): Promise<Attempt> {
    const url = pathToFileURL(join(pkgDir, module)).href;
    // `argv[1]` is the interpreter's own (existing) path, not the module, so
    // the inspect entry guard's `import.meta.url === realpathSync(argv[1])`
    // comparison is false and the CLI does not run. The service reads its port
    // from the same argv, and `0` is an ephemeral port.
    const script = [
        `process.argv = [process.execPath, process.execPath, '--port', '0', '--host', '127.0.0.1'];`,
        `await import(${JSON.stringify(url)});`,
        `process.exit(0);`,
    ].join('\n');
    try {
        const {stdout, stderr} = await run(
            '/usr/bin/env',
            ['-i', `PATH=${CLEAN_PATH}`, `HOME=${homedir()}`, process.execPath, '--input-type=module', '-e', script],
            {timeout: 30_000},
        );
        return {code: 0, stdout, stderr};
    } catch (error) {
        const failure = error as {code?: number | string; killed?: boolean; stdout?: string; stderr?: string};
        const exited = typeof failure.code === 'number' && !failure.killed ? failure.code : null;
        return {
            code: exited,
            stdout: failure.stdout ?? '',
            stderr: `${failure.stderr ?? ''}${failure.killed ? '\n[killed by the test timeout]' : ''}`,
        };
    }
}

t.test('every shipping module loads under a bare node that strips types', async t => {
    const modules = shippingModules();
    // The sweep must actually sweep. A path change that made `readdirSync`
    // return nothing would leave every loop below empty and the test green.
    t.ok(modules.length >= 20, `the sweep found the package's shipping modules (${modules.length})`);
    t.ok(modules.includes('index.ts'), 'the package root a consumer imports is in the sweep');
    t.ok(modules.includes('emitter.ts'), 'the emitter entry is in the sweep');
    t.ok(modules.includes('service.ts'), 'the service entry is in the sweep');
    t.ok(modules.includes('bin/semantic-log-service.ts'), 'the service entry is in the sweep');
    t.ok(modules.includes('flow/participant.ts'), 'the shipped flow fixtures are in the sweep');

    for (const module of modules) {
        const result = await attempt(module);
        // The module is named in the assertion message, so a failure says which
        // file cannot be loaded, and the child's own first error lines are
        // carried into the report.
        const detail = result.stderr.trim().split('\n').slice(0, 4).join(' | ');
        t.equal(result.code, 0, `${module} loads under bare node (exit ${result.code})${detail ? `: ${detail}` : ''}`);
        t.notMatch(
            result.stderr,
            /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/,
            `${module} uses no syntax strip-only mode rejects`,
        );
    }
    t.end();
});
