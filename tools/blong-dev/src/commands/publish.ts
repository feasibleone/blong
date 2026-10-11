/**
 * `blong-dev publish` — the gate for what this repository releases to npm.
 *
 * `rush deploy` and `npm pack` read the same `.npmignore`, and the same file answers two different
 * questions: what an npm consumer needs, and what a running process imports. This repository publishes
 * TypeScript sources (`exports` names `./index.ts`, `./server.ts`), while the ignore files it inherited are
 * allow-lists for a *compiled* package — `*`, then `!/bin/**`, `!/lib/**`, `!/dist/**` — so a package whose
 * layout has none of those publishes metadata and nothing else. Four of the seven packages that declare
 * `ci-publish` were in that state, and nothing inside the repository could notice, because every resolution
 * here goes through the workspace (F-488).
 *
 * `check` asks each publishing package's own manifest what it promises, then asks `npm pack` what it would
 * actually release, and fails when a target that exists here is not in the tarball. It is the check whose
 * absence let `@feasibleone/semantic-log` publish three of the five entry points its `exports` map names,
 * and `blong-login` and `blong-openapi` publish three files each.
 *
 * Usage:
 *   blong-dev publish check [--root <path>] [--json]
 *
 * `--root` names the repository to read instead of walking up from the working directory to `rush.json`;
 * `--json` prints the findings for a report rather than for a person.
 */

import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

import {
    declaredTargets,
    parseRushProjects,
    targetStates,
    unbuiltTargets,
    unpublishedTargets,
    whitelistPatterns,
} from '../publish/packedTarball.ts';
import {findUp} from '../utils/findConfig.ts';

const USAGE = [
    'Usage:',
    '  blong-dev publish check [--root <path>] [--json]',
    '',
    '  check: fail when a package that declares ci-publish would release a tarball without a target its',
    '         own package.json declares and this checkout has',
];

/** One publishing package's answer. */
export interface IPackageFinding {
    dir: string;
    name: string;
    /** How many files the pack would produce, and how many targets the manifest declares. */
    packed: number;
    declared: number;
    /** Declared, present here, and absent from the tarball: the failure this command exists for. */
    unpublished: string[];
    /** Declared and not present here — build output a checkout without a build does not have. */
    unbuilt: string[];
    /** Set when the pack itself could not be read, which is a failure of its own. */
    failure?: string;
}

/** Everything a pack would release for one package, or the reason it could not be asked. */
const packedFiles = (dir: string): {files: string[]; failure?: string} => {
    const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: dir,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (packed.error) return {files: [], failure: `npm pack could not run: ${packed.error.message}`};
    if (packed.status !== 0) {
        const reason = (packed.stderr ?? '').trim().split('\n').slice(-1)[0] ?? 'no output';
        return {files: [], failure: `npm pack exited ${packed.status}: ${reason}`};
    }
    try {
        const answer = JSON.parse(packed.stdout) as {files?: {path: string}[]}[] | {files?: {path: string}[]};
        const first = Array.isArray(answer) ? answer[0] : answer;
        return {files: (first?.files ?? []).map(entry => entry.path)};
    } catch (error) {
        return {files: [], failure: `npm pack's answer could not be read: ${String(error)}`};
    }
};

/**
 * Check every package that declares `ci-publish`, in the order `rush.json` lists it.
 *
 * The publish signal is that script rather than `shouldPublish`, because the release workflow finds the
 * packages to publish by that key: a project that is flagged for publishing but has no script is not
 * published by the pipeline this guards.
 */
export const auditRepository = (root: string): IPackageFinding[] => {
    const projects = parseRushProjects(readFileSync(join(root, 'rush.json'), 'utf8'));
    const findings: IPackageFinding[] = [];
    for (const project of projects) {
        const dir = join(root, project.projectFolder);
        const manifestPath = join(dir, 'package.json');
        if (!existsSync(manifestPath)) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            name?: string;
            scripts?: Record<string, string>;
            exports?: unknown;
            bin?: unknown;
            main?: unknown;
            types?: unknown;
            module?: unknown;
        };
        if (!manifest.scripts?.['ci-publish']) continue;
        const declared = declaredTargets(manifest);
        const ignorePath = join(dir, '.npmignore');
        // No ignore file means npm filters nothing but its own defaults, i.e. every target travels.
        const whitelist = existsSync(ignorePath) ? whitelistPatterns(readFileSync(ignorePath, 'utf8')) : ['**'];
        const {files, failure} = packedFiles(dir);
        const states = targetStates(declared, files, whitelist, target => existsSync(join(dir, target)));
        findings.push({
            dir: project.projectFolder,
            name: manifest.name ?? project.packageName,
            packed: files.length,
            declared: declared.length,
            unpublished: unpublishedTargets(states),
            unbuilt: unbuiltTargets(states),
            ...(failure ? {failure} : {}),
        });
    }
    return findings;
};

/** Report the findings the way the rest of `blong-dev` does: a line each, then a summary. */
const report = (findings: IPackageFinding[]): boolean => {
    const failures = findings.filter(finding => finding.unpublished.length > 0 || finding.failure);
    for (const finding of findings) {
        const notes = [
            finding.unbuilt.length > 0 ? `${finding.unbuilt.length} not built here` : undefined,
            finding.failure,
        ].filter(Boolean);
        const state = finding.unpublished.length > 0 ? 'FAIL' : 'ok';
        console.log(
            `  ${state}  ${finding.dir.padEnd(26)} ${finding.packed} packed, ${finding.declared} declared` +
                (notes.length > 0 ? ` (${notes.join('; ')})` : ''),
        );
        if (finding.unpublished.length > 0) {
            console.log(`        declared, present, not published: ${finding.unpublished.join(', ')}`);
        }
    }
    if (failures.length > 0) {
        console.error(
            `blong-dev publish check: ${failures.length} package(s) would release a tarball without an entry point their manifest declares`,
        );
        return false;
    }
    return true;
};

/** The command: `check` is the only verb, and the default. */
export const publish = (args: string[]): void => {
    const verb = args.find(argument => !argument.startsWith('-')) ?? 'check';
    const json = args.includes('--json');
    const rootArg = args.indexOf('--root');
    if (verb !== 'check') {
        console.error(`blong-dev publish: unknown verb "${verb}"`);
        for (const line of USAGE) console.error(line);
        process.exitCode = 1;
        return;
    }
    const root =
        rootArg >= 0 && args[rootArg + 1]
            ? args[rootArg + 1]
            : (() => {
                  const found = findUp(process.cwd(), 'rush.json');
                  return found ? dirname(found) : undefined;
              })();
    if (!root) {
        console.error('blong-dev publish: no rush.json found above the working directory');
        process.exitCode = 1;
        return;
    }
    const findings = auditRepository(root);
    if (json) console.log(JSON.stringify({root, packages: findings}, null, 2));
    else console.log(`publish check: ${findings.length} package(s) declare ci-publish`);
    if (findings.length === 0) {
        console.error('blong-dev publish: nothing declares ci-publish, which is not a pass');
        process.exitCode = 1;
        return;
    }
    if (!json && !report(findings)) process.exitCode = 1;
    else if (json && findings.some(finding => finding.unpublished.length > 0 || finding.failure)) {
        process.exitCode = 1;
    }
};
