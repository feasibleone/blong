/**
 * The port a realm's simulated (mock) server listens on, one per package.
 *
 * A mock in a `sim` layer is started inside whichever process loads that layer,
 * and a suite that *consumes* a realm inherits its mock: `realm/blong-sport`
 * attaches `party` for RBAC seeding, so its process starts party's Google mock
 * as well. Two packages test in parallel (`rush ci-test --parallelism=max`), so
 * a fixed port makes the second process fail with `EADDRINUSE` — blong-party and
 * blong-sport shared 9082 in build #648 (@@D-694).
 *
 * The runner gives every package its own number the same way the browser's
 * Playwright config derives the gateway port: from the package's index in
 * `rush.json`. Gateways take `9000 + index` and front ends `9100 + index`, so
 * the mocks sit above both, in a band nothing derives from.
 *
 * The value reaches the code that needs it as `GOOGLE_MOCK_PORT`, which the mock
 * itself already reads (to override, set it before the run: an explicit value
 * always wins). The realm's config has to read the same variable, because the
 * browser is told the mock's URL by the backend — see the `db.google` block of
 * `realm/blong-access/server.ts`.
 */

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import stripJsonComments from 'strip-json-comments';

/** First mock port; a package's own is this plus its `rush.json` index. */
export const MOCK_PORT_BASE = 9300;

/** The variable the mock and the realm config both read. */
export const MOCK_PORT_VAR = 'GOOGLE_MOCK_PORT';

/** Walk up from `startDir` to the nearest `fileName`, or `undefined`. */
function findUp(startDir: string, fileName: string): string | undefined {
    let dir = resolve(startDir);
    for (;;) {
        const candidate = join(dir, fileName);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
}

/**
 * The mock port for the package rooted at `cwd`, derived from its index in the
 * monorepo `rush.json`, or `null` outside a Rush workspace.
 *
 * `null` is the case a published realm runs in: there is no `rush.json` above
 * it, so the mock keeps the port its own code defaults to.
 */
export function mockPortForPackage(cwd: string): number | null {
    try {
        const pkgFile = findUp(cwd, 'package.json');
        const rushFile = findUp(cwd, 'rush.json');
        if (!pkgFile || !rushFile) return null;
        // The nearest `package.json` must belong to the directory tree of the
        // workspace the `rush.json` describes; a stray file above it would
        // otherwise resolve some unrelated package's index.
        const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {name?: string};
        if (!pkg.name) return null;
        const rush = JSON.parse(stripJsonComments(readFileSync(rushFile, 'utf8'))) as {
            projects?: Array<{packageName?: string; projectFolder?: string}>;
        };
        const index = (rush.projects ?? []).findIndex(p => p.packageName === pkg.name);
        if (index < 0) return null;
        return MOCK_PORT_BASE + index;
    } catch {
        return null;
    }
}

/**
 * `env`, with the package's mock port added when the caller has not chosen one.
 *
 * An explicit value always wins: that is how a person runs two instances of the
 * same package, and how a suite pins the mock for a reproduction.
 */
export function mockPortEnv(cwd: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    if (env[MOCK_PORT_VAR]) return {...env};
    const port = mockPortForPackage(cwd);
    return port === null ? {...env} : {...env, [MOCK_PORT_VAR]: String(port)};
}
