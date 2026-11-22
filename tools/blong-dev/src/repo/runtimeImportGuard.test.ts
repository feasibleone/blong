/**
 * The gate over the framework's first law: realm code does not depend on the runtime.
 *
 * `blong-gogo` ships as a Docker image (production) or the global `blong` CLI (development) and is
 * never a dependency of realm or suite code. An import of it therefore resolves in every checkout and
 * in every unit test — the module is right there in `node_modules` — and fails only in the one place
 * the runtime is a binary: `realm/blong-blob/orchestrator/upload/blobUploadWrite.ts` imported
 * `limitBytes` from `@feasibleone/blong-gogo/rawBody`, and the suite's migration Job died with
 * `Cannot find package '@feasibleone/blong-gogo'` while every pod carrying the realm crashlooped,
 * 31 minutes into an e2e run that had already built an image and published an artifact (`@@F-750`).
 *
 * The rule is checked here because nothing inside the tree could see it: the import is valid
 * TypeScript, the package resolves, and the tests pass. What it is not is deployable.
 *
 * What is exempt is what no deployed process ever imports: a `*.test.ts`, a package-root `test.ts`
 * (commander's spelling of the same bootstrap), `index.html.ts` (a vite dev entry), and `bin/` (a
 * command a developer runs from the repository).
 */

import type {Dirent} from 'node:fs';
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';

import {test} from 'tap';

import {findUp} from '../utils/findConfig.ts';

/** The folders whose code a deployment runs. */
const DEPLOYED = ['realm', 'suite', 'demo'];

/** An import of the runtime, however it is spelled: a static import or a dynamic one. */
const RUNTIME = /(?:from\s*|import\s*\(\s*)['"]@feasibleone\/blong-gogo(?:\/[^'"]*)?['"]/;

/** What a deployed artifact never loads, so an import there costs nothing. */
const EXEMPT =
    /(^|\/)(bin|test)\/|\/[^/]*\.test\.tsx?$|(^|\/)(index\.html\.ts|test\.ts)$|(^|\/)generate\.tool\.ts/;

/** Whether a path is source a deployment runs. */
export function isDeployedSource(path: string): boolean {
    return /\.(ts|tsx|mts|cts|js|mjs)$/.test(path) && !EXEMPT.test(path);
}

/** The line that imports the runtime, 1-based, or `undefined` when the file imports none. */
export function runtimeImportLine(text: string): number | undefined {
    const index = text.split('\n').findIndex(line => RUNTIME.test(line));
    return index < 0 ? undefined : index + 1;
}

/** Every source file under a folder, as paths relative to the repository root. */
function sources(root: string, folder: string): string[] {
    const found: string[] = [];
    const walk = (current: string): void => {
        let entries: Dirent[];
        try {
            entries = readdirSync(current, {withFileTypes: true});
        } catch {
            return;
        }
        for (const entry of entries) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist') continue;
                walk(path);
                continue;
            }
            found.push(relative(root, path));
        }
    };
    walk(join(root, folder));
    return found;
}

/** The imports of the runtime that a deployment would fail to resolve. */
export function runtimeImports(root: string, folders: readonly string[] = DEPLOYED): string[] {
    const findings: string[] = [];
    for (const folder of folders) {
        for (const path of sources(root, folder)) {
            if (!isDeployedSource(path)) continue;
            const line = runtimeImportLine(readFileSync(join(root, path), 'utf8'));
            if (line !== undefined) findings.push(`${path}:${line}`);
        }
    }
    return findings;
}

/** The repository root, from the working directory, or `undefined` outside a checkout. */
function repositoryRoot(): string | undefined {
    const rush = findUp(process.cwd(), 'rush.json');
    return rush === undefined ? undefined : dirname(rush);
}

test('no realm, suite or demo source imports the runtime', t => {
    const root = repositoryRoot();
    t.ok(root, 'the repository root is above the working directory');
    if (!root) {
        t.end();
        return;
    }
    t.same(
        runtimeImports(root),
        [],
        'the runtime is a binary, not a dependency — reach a helper through the package a realm ' +
            'may import (`@feasibleone/blong/…`), and keep the reasoning in memory',
    );
    t.end();
});

test('the guard reads the shape of a violation, and the files a deployment never loads', t => {
    t.equal(
        runtimeImportLine('const x = 1;'),
        undefined,
        'a file that imports nothing from the runtime is not a finding',
    );
    t.equal(
        runtimeImportLine(
            "import {limitBytes} from '@feasibleone/blong-gogo/rawBody';\nimport {handler} from './x.ts';",
        ),
        1,
        'the subpath form that broke the deployment is a finding on its first line',
    );
    t.equal(
        runtimeImportLine("const load = await import('@feasibleone/blong-gogo');"),
        1,
        'and so is the dynamic form',
    );
    t.equal(
        isDeployedSource('realm/blong-blob/orchestrator/upload/blobUploadWrite.ts'),
        true,
        'a handler is deployed source',
    );
    for (const path of [
        'realm/blong-commander/test.ts',
        'realm/blong-sport/index.html.ts',
        'realm/blong-sport/index.test.ts',
        'realm/blong-sport/server/test/test/testSport.ts',
        'realm/blong-kustomize/bin/kustomize.ts',
    ]) {
        t.equal(
            isDeployedSource(path),
            false,
            `${path} is loaded by a runner or a developer, not by a deployment`,
        );
    }
    t.end();
});
