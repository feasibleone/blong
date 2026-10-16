/**
 * The run's own account of which operations failed, read from its job log.
 *
 * Every test job ends with a summary block the CI harness prints — one entry per operation, with
 * the command it ran, the verdict line `blong-dev` wrote and the exit code — and it is the only
 * place a failure that published no report appears at all. Build #622 is why this exists: three
 * operations failed, the failures bundle listed two, and the missing one (`blong-log`, whose
 * Storybook leg exited 1 while its tap report read as passed) was visible nowhere else. The leg
 * is fixed at the source now, so this is the cross-check rather than the only witness (@@F-539).
 *
 * Timestamps are stripped because GitHub prefixes every line of a log with one; the blocks are
 * matched on the harness's own markers rather than on position.
 */

/** One operation of the run, as the harness summarised it. */
export interface IOperationResult {
    /** Repository folder name, e.g. `blong-cli`. */
    package: string;
    /** The scoped name the harness printed, e.g. `@feasibleone/blong-cli`. */
    scoped: string;
    verdict: 'failure' | 'warning';
    /** The wall clock the harness measured it in, in its own words. */
    durationText?: string;
    /** The commands the operation ran. */
    commands: string[];
    /** The lines under it that carry a verdict: `✖ …`, `# <pkg>: …`. */
    detail: string[];
}

/** The harness's entry header, e.g. `--[ FAILURE: @feasibleone/blong-cli ]--[ 1m 10s ]--`. */
const ENTRY = /^--+\[ (FAILURE|WARNING|SUCCESS WITH WARNINGS): (\S+) \]-+\[ (.*?) \]--+$/;

/** GitHub's log timestamps, as the API returns them. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;

/** Lines worth keeping from an operation's block, with the noise around them dropped. */
const INTERESTING = /^(?:✖|#|Tests|Test Suites|Snapshots|Failed|Error)/;

/** Longest detail line kept; a storybook failure dumps its whole log under one of them. */
const MAX_DETAIL_CHARS = 240;

/** How many detail lines one operation contributes. */
const MAX_DETAIL_LINES = 12;

/** The package folder name behind the harness's scoped name. */
function folderOf(scoped: string): string {
    const name = scoped.includes('/') ? scoped.slice(scoped.indexOf('/') + 1) : scoped;
    return name;
}

/**
 * Read the harness's per-operation summary out of a job log.
 *
 * Failures first: the block is written in two groups (`FAILURE: n operations` then the warnings),
 * and a reader wants the red ones before the yellow ones.
 */
export function parseOperationResults(log: string): IOperationResult[] {
    const entries: IOperationResult[] = [];
    let current: IOperationResult | undefined;

    for (const raw of log.split(/\r?\n/)) {
        const line = raw.replace(TIMESTAMP, '');
        const header = ENTRY.exec(line);
        if (header) {
            if (current) entries.push(current);
            current = {
                scoped: header[2]!,
                package: folderOf(header[2]!),
                verdict: header[1] === 'FAILURE' ? 'failure' : 'warning',
                durationText: header[3]!.trim() === '' ? undefined : header[3]!.trim(),
                commands: [],
                detail: [],
            };
            continue;
        }
        if (!current) continue;
        // A new section of the summary ends the block: the harness prints `==[ … ]==` between
        // groups, and the next `--[` header would have been matched above.
        if (/^==+\[/.test(line)) {
            entries.push(current);
            current = undefined;
            continue;
        }
        const text = line.trim();
        if (text === '') continue;
        if (text.startsWith('Invoking')) {
            // The initial invocation is the operation; the coverage and lint steps that follow it
            // are the harness's own bookkeeping.
            if (current.commands.length === 0) {
                current.commands.push(text.replace(/^Invoking[^:]*:\s*/, '').trim());
            }
            continue;
        }
        if (!INTERESTING.test(text) || current.detail.length >= MAX_DETAIL_LINES) continue;
        current.detail.push(
            text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS - 1)}…` : text,
        );
    }
    if (current) entries.push(current);

    return entries.sort((left, right) =>
        left.verdict === right.verdict ? 0 : left.verdict === 'failure' ? -1 : 1,
    );
}
