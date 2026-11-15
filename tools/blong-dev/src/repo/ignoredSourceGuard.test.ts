/**
 * The gate over this repository's own source tree.
 *
 * A package folder can be ignored without anybody noticing: `.gitignore` matches a *name*, and a
 * name is a perfectly good handler group. `temp` was ignored for Rush's install tree, and it also
 * swallowed `realm/blong-blob/{gateway,orchestrator}/temp/` — so the realm's sweep worked in every
 * checkout that had the files and did not exist in CI, which reported it as a test reading
 * `undefined` three runs in a row (`@@F-747`). The rule now names paths, and this gate watches the
 * tree, in the shape `@@D-867` records.
 *
 * Nothing inside the repository could see it, because the files are there until you clone. This is
 * the check that runs where it matters: against what git is actually willing to publish.
 *
 * Two kinds of ignored path are deliberate and are not reported. A package may ignore a fixture it
 * generates — `core/blong-kukum` does, for the realm its end-to-end test scaffolds — and a package
 * may leave API Extractor's reports beside it. The first is recognised by *whose* ignore file says
 * so: a rule in a package's own `.gitignore` is the package's decision, while a rule in the root one
 * applies to folders it has never heard of, which is exactly how a handler group disappears.
 */

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

import stripJsonComments from 'strip-json-comments';
import {test} from 'tap';

import {findUp} from '../utils/findConfig.ts';

/** The extensions that are source rather than build output. */
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|md|ya?ml|jsonc?)$/i;

/** Build output that legitimately lives inside a package and is legitimately ignored. */
const ARTEFACT = /(^|\/)(node_modules|dist|lib|lib-esm|\.tap|\.ci-report|\.playwright|coverage)\//;

/** API Extractor's report beside a package. */
const REPORT = /\.api\.(json|md)$/i;

/** A lockfile a package manager leaves behind; this repository publishes none for a package. */
const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock)$/i;

/** Every project folder `rush.json` declares. */
function projectFolders(root: string): {folder: string; name: string}[] {
    const file = join(root, 'rush.json');
    if (!existsSync(file)) return [];
    const rush = JSON.parse(stripJsonComments(readFileSync(file, 'utf8'))) as {
        projects?: Array<{packageName?: string; projectFolder?: string}>;
    };
    return (rush.projects ?? [])
        .map(project => ({folder: project.projectFolder ?? '', name: project.packageName ?? ''}))
        .filter(project => project.folder !== '');
}

/** Paths git ignores, as the repository root sees them. */
function ignoredPaths(root: string): string[] {
    const out = execFileSync(
        'git',
        ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
        {cwd: root, encoding: 'utf8'},
    );
    return out.split('\n').filter(line => line.trim() !== '');
}

/** Which ignore file decided each path, keyed by path; the root file is spelled `.gitignore`. */
function ignoredBy(root: string, paths: readonly string[]): Map<string, string> {
    const decided = new Map<string, string>();
    if (paths.length === 0) return decided;
    let out = '';
    try {
        out = execFileSync('git', ['check-ignore', '-v', '--no-index', ...paths], {
            cwd: root,
            encoding: 'utf8',
        });
    } catch (error) {
        // `check-ignore` exits 1 when nothing matched, and its output is still the answer.
        const stdout = (error as {stdout?: string | Buffer}).stdout;
        out = stdout === undefined ? '' : String(stdout);
    }
    for (const line of out.split('\n')) {
        const match = /^(?<file>.+?):\d+:\S+\t(?<path>.+)$/.exec(line.trim());
        if (match?.groups) decided.set(match.groups['path'] ?? '', match.groups['file'] ?? '');
    }
    return decided;
}

/** The ignored paths that are source inside a package, with the reason each one is a defect. */
export function ignoredSource(
    root: string,
    ignored: readonly string[] = ignoredPaths(root),
): string[] {
    const folders = projectFolders(root);
    const candidates = ignored.filter(path => {
        if (!SOURCE.test(path) || REPORT.test(path) || LOCKFILE.test(path)) return false;
        if (ARTEFACT.test(path)) return false;
        return folders.some(
            project => path === project.folder || path.startsWith(`${project.folder}/`),
        );
    });
    const owning = ignoredBy(root, candidates);
    const findings: string[] = [];
    for (const path of candidates) {
        const rule = owning.get(path);
        // A rule a package wrote is the package's own decision; the root file is the one that
        // applies to folders nobody had in mind.
        if (rule !== undefined && rule !== '.gitignore') continue;
        const folder = folders.find(
            project => path === project.folder || path.startsWith(`${project.folder}/`),
        );
        findings.push(`${path} (in ${folder?.name || folder?.folder || '?'})`);
    }
    return findings;
}

/** The repository root, from the working directory, or `undefined` outside a checkout. */
function repositoryRoot(): string | undefined {
    const rush = findUp(process.cwd(), 'rush.json');
    return rush === undefined ? undefined : dirname(rush);
}

test('no package source is ignored by the root ignore file', t => {
    const root = repositoryRoot();
    t.ok(root, 'the repository root is above the working directory');
    if (!root) {
        t.end();
        return;
    }
    t.same(
        ignoredSource(root),
        [],
        'a file git will not publish is a file CI cannot run — un-ignore it, or rename the folder',
    );
    t.end();
});

test('the guard reports a package’s source ignored by the root file, not by its own', t => {
    const root = repositoryRoot();
    if (!root) {
        t.end();
        return;
    }
    t.same(
        ignoredSource(root, [
            // Ignored by the package's own `.gitignore` — a fixture it generates.
            'core/blong-kukum/test/fixture/e2e-realm/browser.ts',
            // Ignored by the root file: the shape that broke CI.
            'realm/blong-blob/orchestrator/temp/blobTempCleanup.ts',
            'realm/blong-blob/dist/blob.js',
            '.github/skills/blong-blob/SKILL.md',
        ]),
        ['realm/blong-blob/orchestrator/temp/blobTempCleanup.ts (in @feasibleone/blong-blob)'],
        'a package’s own fixture and build output pass; source the root file hides does not',
    );
    t.end();
});
