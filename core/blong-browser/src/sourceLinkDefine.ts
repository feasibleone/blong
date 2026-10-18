/**
 * The source-link environment a Vite or Storybook build injects for the TestRun console.
 *
 * The browser cannot read `process.env`, and the source pointers a run captures are
 * either absolute (`file:///…`) or relative to the Vite root (`/s/browser/test/…`).
 * The package root and the workspace root are what turn the second kind into a
 * repository path, so they are resolved here, at build time, and replaced in the
 * bundle as `globalThis.__BLONG_SOURCE_LINK__`.
 */
import {existsSync} from 'node:fs';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/** What the browser reads back from `globalThis.__BLONG_SOURCE_LINK__`. */
export interface IInjectedSourceLink {
    /** The process is a captured CI run, so links point at the repository, not the editor. */
    ci: boolean;
    /** GitHub `owner/repository`, from `GITHUB_REPOSITORY`. */
    repository: string;
    /** PR head branch, tag or SHA, from `GITHUB_HEAD_REF`/`GITHUB_REF_NAME`. */
    branch: string;
    /** Absolute path of the monorepo root. */
    workspaceRoot: string;
    /** Package path from the workspace root, e.g. `realm/blong-access`. */
    packagePath: string;
    /**
     * The remote segment of a `vscode://` URI, from `BLONG_VSCODE_REMOTE` or
     * `VSCODE_REMOTE_AUTHORITY`, e.g. `vscode-remote/ssh-remote+ms-02`.
     */
    vscodeRemote?: string;
}

/** Walk up from `start` to the first folder holding `rush.json` or `.git`. */
export function workspaceRootOf(start: string): string {
    let current = start;
    for (;;) {
        if (existsSync(join(current, 'rush.json')) || existsSync(join(current, '.git'))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) return start;
        current = parent;
    }
}

/** The package root a Vite config is written in. */
export function packageRootOf(importMetaUrl: string): string {
    if (!importMetaUrl.startsWith('file:')) return process.cwd();
    return dirname(fileURLToPath(importMetaUrl));
}

/** The `define` entry, shaped as the global the console reads. */
export function sourceLinkDefine(
    packageRoot: string,
    env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
    const workspaceRoot = workspaceRootOf(packageRoot);
    const packagePath = relative(workspaceRoot, packageRoot).split(sep).join('/');
    const value: IInjectedSourceLink = {
        ci: Boolean(env['CI']),
        repository: env['GITHUB_REPOSITORY'] || 'feasibleone/blong',
        branch: env['GITHUB_HEAD_REF'] || env['GITHUB_REF_NAME'] || 'main',
        workspaceRoot,
        packagePath: packagePath.startsWith('..') ? '' : packagePath,
        vscodeRemote: env['BLONG_VSCODE_REMOTE'] || env['VSCODE_REMOTE_AUTHORITY'] || '',
    };
    return {'globalThis.__BLONG_SOURCE_LINK__': JSON.stringify(value)};
}
