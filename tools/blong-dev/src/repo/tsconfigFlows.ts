/**
 * Whether a package's typecheck compiles its own tap flows.
 *
 * `blong-dev lint` type-checks a package with `tsc --noEmit`, which checks exactly what the
 * package's `tsconfig` names — so a folder the list forgets is a folder nothing type-checks, and
 * nothing inside the package can tell: a file outside `include` is valid TypeScript, its imports
 * resolve, and the tests it is not part of still pass.
 *
 * That is not hypothetical. `realm/blong-party/tsconfig.json` enumerated its folders and omitted
 * `server/`, so every flow under `server/test/test/` sat outside the check and outside CI. A flow
 * that annotated a step's inputs with the wrong property name — `{theFirstEditCreatesThePerson:
 * created}` declared as `{created: …}` — read as correct, was reported by the editor alone, and
 * would have failed only when the flow ran (`@@T-695`).
 *
 * What is checked is `server/test/**`, the tap flows: they are never excluded, and they are the
 * half of a package nothing else compiles. `test/**` is deliberately out of scope — those are the
 * Playwright specs, which every package excludes as `test/*.play.ts` and the Playwright config
 * bundles for itself.
 *
 * The answer comes from TypeScript itself rather than from a glob matcher of ours: a `tsconfig` may
 * carry comments and trailing commas (`core/blong-browser` does), and the pattern semantics are
 * best not re-implemented.
 */

import type {Dirent} from 'node:fs';
import {existsSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import ts from 'typescript';

/** The folders that hold first-party packages, each package a direct child. */
export const CATEGORIES = ['core', 'realm', 'suite', 'demo', 'test', 'tools'];

/** The folder a package's tap flows live in, relative to the package. */
const FLOWS = 'server/test';

/** What no typecheck reads, whatever a package's `tsconfig` says. */
const IGNORED = new Set(['node_modules', 'dist', '.lint', '.docusaurus', 'coverage', 'temp']);

const SOURCE = /\.(ts|tsx|mts|cts)$/;

/** Every source file under `directory`, as paths relative to it. */
export function sourcesOf(directory: string): string[] {
    const found: string[] = [];
    const walk = (current: string): void => {
        let entries: Dirent[];
        try {
            entries = readdirSync(current, {withFileTypes: true});
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (IGNORED.has(entry.name)) continue;
                walk(join(current, entry.name));
                continue;
            }
            if (SOURCE.test(entry.name)) found.push(relative(directory, join(current, entry.name)));
        }
    };
    walk(directory);
    return found;
}

/** The files a package's `tsconfig` compiles, as paths relative to the package. */
export function compiledSources(directory: string): string[] {
    const result = ts.readConfigFile(join(directory, 'tsconfig.json'), ts.sys.readFile);
    if (result.error) {
        throw new Error(
            `${join(directory, 'tsconfig.json')}: ` +
                ts.flattenDiagnosticMessageText(result.error.messageText, ' '),
        );
    }
    const parsed = ts.parseJsonConfigFileContent(result.config, ts.sys, directory);
    return parsed.fileNames.map(file => relative(directory, file).split('\\').join('/'));
}

/** The tap flows a package's typecheck does not compile, as `package/server/test/…`. */
export function uncompiledFlows(
    root: string,
    categories: readonly string[] = CATEGORIES,
): string[] {
    const findings: string[] = [];
    for (const category of categories) {
        let packages: Dirent[];
        try {
            packages = readdirSync(join(root, category), {withFileTypes: true});
        } catch {
            continue;
        }
        for (const entry of packages) {
            if (!entry.isDirectory()) continue;
            const directory = join(root, category, entry.name);
            if (
                !existsSync(join(directory, FLOWS)) ||
                !existsSync(join(directory, 'tsconfig.json'))
            )
                continue;
            const compiled = new Set(compiledSources(directory));
            for (const path of sourcesOf(join(directory, FLOWS))) {
                const flow = `${FLOWS}/${path}`;
                if (!compiled.has(flow)) findings.push(`${category}/${entry.name}/${flow}`);
            }
        }
    }
    return findings;
}
