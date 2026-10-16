/**
 * The `gh` CLI, for the parts of a run only GitHub knows.
 *
 * A run's reports are published to the reports site and are readable without a credential, but
 * three things are not there: which operations the run's own summary called failed, the job log
 * that names them, and the `reports` artifact that holds every package's `.ci-report/`. Those
 * need an authenticated `gh`, and a diagnosis that cannot reach it must say so rather than
 * report a green run.
 *
 * Every call resolves with the exit code instead of throwing: a missing `gh`, an expired token
 * or a run whose artifact expired all have to be *reported*, and an exception in the middle of a
 * diagnosis reads as a crash rather than as a gap.
 */

import {execFile} from 'node:child_process';

/** What a `gh` invocation returned, whether or not it succeeded. */
export interface IGhResult {
    code: number;
    stdout: string;
    stderr: string;
}

export interface IGhOptions {
    cwd?: string;
    /**
     * Bytes of stdout to keep, in bytes.
     *
     * A test job's log is megabytes and `gh` refuses to print one that carries the terminal
     * escapes GitHub stores in it unless this is asked for, so both are set here rather than at
     * each call site (that refusal arrives as exit 1 with an explanation on stderr).
     */
    maxBuffer?: number;
}

const DEFAULT_MAX_BUFFER = 256 * 1024 * 1024;

/** Run `gh` and resolve with its output and exit code. */
export function ghRun(args: readonly string[], options: IGhOptions = {}): Promise<IGhResult> {
    return new Promise(resolve => {
        execFile(
            'gh',
            [...args],
            {
                cwd: options.cwd,
                maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
                encoding: 'utf8',
                // The log of a run carries the escapes `gh` writes into it; asking for them is
                // what makes the command print instead of refusing.
                env: {...process.env, GH_PAGER: 'cat', NO_COLOR: '1'},
            },
            (error, stdout, stderr) => {
                const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
                resolve({code, stdout: stdout ?? '', stderr: stderr ?? ''});
            },
        );
    });
}

/** Run `gh api <path>` and parse its JSON body, or `undefined` when it failed. */
export async function ghApiJson<T>(path: string, options: IGhOptions = {}): Promise<T | undefined> {
    return parseJson<T>(await ghRun(['api', path], options));
}

/**
 * Run a `gh` subcommand that prints JSON and parse it.
 *
 * `gh run list` and `gh pr list` are what makes a run's *id* known, which the API alone cannot
 * answer: the endpoint that lists a workflow's runs wants its file name or numeric id, while the
 * CLI accepts the workflow's name — the one a person knows.
 */
export async function ghCliJson<T>(
    args: readonly string[],
    options: IGhOptions = {},
): Promise<T | undefined> {
    return parseJson<T>(await ghRun(args, options));
}

/** Parse a successful result's body, resolving `undefined` for anything else. */
function parseJson<T>(result: IGhResult): T | undefined {
    if (result.code !== 0) return undefined;
    try {
        return JSON.parse(result.stdout) as T;
    } catch {
        return undefined;
    }
}

/** Run `gh api <endpoint>` and resolve with its raw body, or `undefined` when it failed. */
export async function ghText(
    args: readonly string[],
    options: IGhOptions = {},
): Promise<string | undefined> {
    const result = await ghRun(args, options);
    return result.code === 0 ? result.stdout : undefined;
}

/** Whether an authenticated `gh` is reachable at all. */
export async function ghAvailable(): Promise<boolean> {
    const result = await ghRun(['auth', 'status']);
    return result.code === 0;
}

/** True when `gh` failed for want of a credential rather than for want of a run. */
export function ghNeedsAuth(result: IGhResult): boolean {
    return /authentication|not logged|gh auth login/i.test(result.stderr);
}
