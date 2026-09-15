/**
 * Filesystem locations of the `<pkg>/.ci-report/` contract.
 */

import {existsSync, mkdirSync} from 'node:fs';
import {basename, dirname, join, relative, resolve} from 'node:path';

/** Directory (package-relative) holding every report artifact of a package. */
export const REPORT_DIR = '.ci-report';

/** Sub-directory of {@link REPORT_DIR} published to the reports repository. */
export const PUBLISH_DIR = 'publish';

/** Absolute path of the package's report directory, optionally created. */
export function reportDir(cwd: string, create = false): string {
    const dir = join(cwd, REPORT_DIR);
    if (create) mkdirSync(dir, {recursive: true});
    return dir;
}

/** Absolute path of a file inside the package's report directory. */
export function reportPath(cwd: string, file: string, create = false): string {
    const dir = reportDir(cwd, create);
    return join(dir, file);
}

/**
 * Walk up from `cwd` until a directory containing `rush.json` is found.
 * Returns `cwd` when no repository root can be located, so callers never crash
 * on a stray checkout.
 */
export function repoRoot(cwd: string): string {
    let dir = resolve(cwd);
    for (;;) {
        if (existsSync(join(dir, 'rush.json'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return resolve(cwd);
        dir = parent;
    }
}

/** Repository-relative path of the current package, e.g. `realm/blong-access`. */
export function packageRelPath(cwd: string): string {
    const rel = relative(repoRoot(cwd), resolve(cwd));
    return rel === '' ? '.' : rel.split('\\').join('/');
}

/** Package folder name, e.g. `blong-access`. */
export function packageName(cwd: string): string {
    return basename(resolve(cwd));
}
