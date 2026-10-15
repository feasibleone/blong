/**
 * Packages whose `ci-test` produced no report.
 *
 * The report counts what reported, so a package whose e2e suite never ran is absent from every
 * number in it — and reads exactly like the dozens of packages that have no tests to run at all.
 * That is how `blong-int-adapter` spent months with no report: its `ci-test` gated the tests behind
 * a waiter that gave up, and the only trace left was the log of the project that failed @@F-530.
 *
 * Two states are worth telling apart, and Rush's own output answers which: a project whose
 * `ci-test` output Rush recorded *ran* and stopped before it could report (a command that failed
 * mid-run), while a project with no such log *never ran* — Rush skips the dependents of a project
 * that failed, which is the other way a package loses its suite in silence.
 *
 * Asked for only on a red run. A green run cannot contain a skipped project, because the skip is
 * what a failure causes; and a project whose `ci-test` legitimately runs no tests would only add
 * noise to a list that exists to explain a failure.
 */
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import {type IRushProject} from './aggregate.ts';

/** One package that has a `ci-test` script and no report to show for it. */
export interface ISilentProject {
    /** npm name, as the CI report names it. */
    packageName: string;
    /** Folder relative to the repository root — the key every report is filed under. */
    projectFolder: string;
    /** `stopped`: the command ran and did not report. `never-ran`: Rush recorded no output for it. */
    state: 'never-ran' | 'stopped';
}

/** Where Rush keeps a project's output for one command. */
const RUSH_LOG_DIR = join('.rush', 'temp', 'chunked-rush-logs');

/** Does this project declare a `ci-test` script to run at all? */
function hasCiTest(root: string, projectFolder: string): boolean {
    try {
        const pkg = JSON.parse(readFileSync(join(root, projectFolder, 'package.json'), 'utf8')) as {
            scripts?: Record<string, string>;
        };
        return typeof pkg.scripts?.['ci-test'] === 'string';
    } catch {
        return false;
    }
}

/** Did Rush record output for this project's `ci-test`? */
function hasCommandLog(root: string, projectFolder: string): boolean {
    const dir = join(root, projectFolder, RUSH_LOG_DIR);
    if (!existsSync(dir)) return false;
    try {
        return readdirSync(dir).some(name => name.endsWith('.ci-test.chunks.jsonl'));
    } catch {
        return false;
    }
}

/**
 * The projects that have a `ci-test` script and are absent from `reported`.
 *
 * `reported` carries the folder names the report is keyed by, because that is the identity the
 * collected reports use: a package is named by the folder it lives in (`test/blong-int-adapter`
 * reads as `blong-int-adapter`), not by its npm name.
 */
export function collectSilentProjects(
    root: string,
    projects: readonly IRushProject[],
    reported: readonly string[],
): ISilentProject[] {
    const silent: ISilentProject[] = [];
    for (const project of projects) {
        const folder = project.projectFolder.split('/').pop() ?? project.projectFolder;
        if (reported.includes(folder)) continue;
        if (!hasCiTest(root, project.projectFolder)) continue;
        silent.push({
            packageName: project.packageName,
            projectFolder: project.projectFolder,
            state: hasCommandLog(root, project.projectFolder) ? 'stopped' : 'never-ran',
        });
    }
    return silent;
}
