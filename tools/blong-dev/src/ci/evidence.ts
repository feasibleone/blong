/**
 * What the `reports` artifact adds to the published bundle.
 *
 * The bundle an agent reads first names the failing tests; the artifact holds the *reason*, in
 * two places the bundle does not have. A tap failure's stream is beside its report
 * (`tap.raw.tap`), and it is the only record of a run tap killed — `tap.json` is written before
 * tap's verdict, so an expired budget can leave it with nothing at all. A Storybook leg's log
 * (`storybook.log`) carries the jest failure the image snapshot produced. Both are read here, and
 * both are read from the *artifact* rather than from a checkout because the run happened on a
 * runner, in a commit that is usually not the one on disk.
 *
 * Downloading the artifact is the expensive step (`gh run download` unpacks every package's
 * `.ci-report/`, ~100MB), which is why it is what `--full` buys rather than the default
 * (@@D-561).
 */

import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

import {REPORT_DIR} from '../report/reportPaths.ts';
import type {IReport} from '../report/reportTypes.ts';
import {readReport} from '../report/reportWrite.ts';
import {RAW_TAP_FILE, tapExcerpt} from '../report/tapExcerpt.ts';

/** File the Storybook leg writes its jest log to, when the package runs one. */
export const STORYBOOK_LOG = 'storybook.log';

/**
 * What the tap runner captured of the test process's stderr, when it wrote any.
 *
 * The last thing a suite prints before it dies at load is the check that refused it, and that
 * message is on stderr — the raw stream holds tap's own view, and the reporter's JSON holds no
 * reason at all for a file that never ran (@@F-543).
 */
export const RUNNER_STDERR_FILE = 'tap-stderr.txt';

/** Lines of the stderr tail kept. */
const MAX_STDERR_LINES = 20;

/** Longest line kept from a jest log; a diff line can name a very long path. */
const MAX_LINE_CHARS = 200;

/** Lines of a jest failure block kept before the cap applies. */
const MAX_BLOCK_LINES = 20;

/**
 * Where jest stops talking about one test.
 *
 * A failure block ends at the next `●` marker, and the run's own summary follows — with a blank
 * line between them, which is why the cap alone cannot end the block at the right place.
 */
const BLOCK_END = /^\s*(?:●\s|›\s|Snapshot Summary|Test Suites:|Tests:|Time:|Ran all test suites)/;

/** What a downloaded artifact can answer about a failure. */
export interface IArtifactEvidence {
    /** The raw stream around the failure, or `undefined` when the artifact holds no stream for it. */
    excerpt(failure: {path: string; runner: string; test: string}): string | undefined;
    /** The report a package's legs wrote, with one slice per runner. */
    report(pkgPath: string): IReport | undefined;
    /** The message the leg's own report carries for a test, when the bundle had none. */
    message(pkgPath: string, runner: string, test: string): string | undefined;
    /**
     * The failures a leg's own log names, for a leg that published no report at all.
     *
     * This is the last resort and the one build #622 needed: the Storybook leg of `blong-log`
     * exited 1, wrote its jest log, and left the package's report to the tap leg, so neither the
     * bundle nor the report of the artifact held the failing test (@@F-539).
     */
    logFailures(pkgPath: string): Array<{runner: string; test: string; excerpt: string}>;
    /**
     * What the test process wrote to stderr, for a package that captured any.
     *
     * The reason a suite died while loading is here and nowhere else: it never reached the TAP
     * stream, and the report only records that the process exited (@@F-543).
     */
    stderr(pkgPath: string): string | undefined;
    /**
     * A package's repository-relative path, found by the folder it published its report in.
     *
     * The bundle says where each of its packages lives; a package the bundle has nothing for does
     * not, and the operation summary names it alone.
     */
    locate(packageName: string): string | undefined;
}

/**
 * Read the readable reason out of a Storybook leg's jest log.
 *
 * jest marks a failing test with `● <suite> › <test>` and follows it with the assertion, its
 * diff summary and the code frame, so the block up to the next `●` is the failure as the runner
 * reported it.
 */
export function storybookExcerpt(log: string, test: string): string | undefined {
    const lines = log.split(/\r?\n/);
    const start = lines.findIndex(line => /^\s*●\s+.*$/.test(line) && line.includes(test));
    if (start === -1) return undefined;

    const block: string[] = [];
    for (let index = start; index < lines.length && block.length < MAX_BLOCK_LINES; index += 1) {
        const line = lines[index]!;
        if (index > start && BLOCK_END.test(line)) break;
        const trimmed = line.trimEnd();
        block.push(
            trimmed.length > MAX_LINE_CHARS ? `${trimmed.slice(0, MAX_LINE_CHARS - 1)}…` : trimmed,
        );
    }
    while (block.length > 0 && block.at(-1)?.trim() === '') block.pop();
    return block.length > 0 ? block.join('\n') : undefined;
}

/**
 * The names of every failing test a jest log quotes.
 *
 * jest marks each one with `● <suite> › <test>` and repeats the marker in its summary, so the
 * names are deduplicated — the count of a `●` line is not the count of failures.
 */
export function jestFailures(log: string): string[] {
    const names: string[] = [];
    for (const line of log.split(/\r?\n/)) {
        const match = /^\s*●\s+(.*)$/.exec(line);
        const name = match?.[1]?.trim();
        if (name !== undefined && name !== '' && !names.includes(name)) names.push(name);
    }
    return names;
}

/**
 * A reader over an unpacked `reports` artifact.
 *
 * Each file is read at most once: one stream holds the evidence of every failure in its package,
 * and a leg's log is a megabyte of jest output that a diagnosis reads for one block.
 */
export function artifactEvidence(dir: string): IArtifactEvidence {
    const streams = new Map<string, string | null>();
    const logs = new Map<string, string | null>();
    const reports = new Map<string, IReport | null>();
    const readOnce = (cache: Map<string, string | null>, file: string): string | undefined => {
        if (!cache.has(file)) cache.set(file, existsSync(file) ? readFileSync(file, 'utf8') : null);
        return cache.get(file) ?? undefined;
    };

    return {
        excerpt(failure) {
            const reportDir = join(dir, failure.path, REPORT_DIR);
            if (failure.runner === 'tap') {
                const raw = readOnce(streams, join(reportDir, RAW_TAP_FILE));
                return raw === undefined ? undefined : tapExcerpt(raw, failure.test);
            }
            if (failure.runner === 'storybook' || failure.runner === 'jest') {
                const log = readOnce(logs, join(reportDir, STORYBOOK_LOG));
                return log === undefined ? undefined : storybookExcerpt(log, failure.test);
            }
            return undefined;
        },
        report(pkgPath) {
            if (!reports.has(pkgPath)) reports.set(pkgPath, readReport(join(dir, pkgPath)) ?? null);
            return reports.get(pkgPath) ?? undefined;
        },
        message(pkgPath, runner, test) {
            const report = reports.get(pkgPath) ?? readReport(join(dir, pkgPath)) ?? null;
            reports.set(pkgPath, report);
            const run = report?.runs.find(candidate => candidate.runner === runner);
            for (const suite of run?.suites ?? []) {
                for (const entry of suite.tests) {
                    if (entry.name === test || entry.name.endsWith(`› ${test}`))
                        return entry.message;
                }
            }
            return undefined;
        },
        logFailures(pkgPath) {
            const log = readOnce(logs, join(dir, pkgPath, REPORT_DIR, STORYBOOK_LOG));
            if (log === undefined) return [];
            return jestFailures(log).map(test => ({
                runner: 'storybook',
                test,
                excerpt: storybookExcerpt(log, test) ?? '',
            }));
        },
        stderr(pkgPath) {
            const captured = readOnce(streams, join(dir, pkgPath, REPORT_DIR, RUNNER_STDERR_FILE));
            if (captured === undefined) return undefined;
            const lines = captured
                .split(/\r?\n/)
                .map(line =>
                    line.trimEnd().length > MAX_LINE_CHARS
                        ? `${line.trimEnd().slice(0, MAX_LINE_CHARS - 1)}…`
                        : line.trimEnd(),
                );
            while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop();
            if (lines.length === 0) return undefined;
            const kept = lines.slice(-MAX_STDERR_LINES);
            const head =
                lines.length > kept.length
                    ? [`… ${lines.length - kept.length} earlier line(s)`]
                    : [];
            return [...head, ...kept].join('\n');
        },
        locate(packageName) {
            const categories = existsSync(dir) ? readdirSync(dir, {withFileTypes: true}) : [];
            for (const category of categories) {
                if (!category.isDirectory()) continue;
                const folder = join(dir, category.name, packageName);
                if (category.name === packageName) continue;
                if (existsSync(join(folder, REPORT_DIR))) {
                    return `${category.name}/${packageName}`;
                }
            }
            return undefined;
        },
    };
}
