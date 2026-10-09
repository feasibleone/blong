/**
 * scripts/lib/exec.ts — the seam between a step and the machine it runs on.
 *
 * Every step in this folder asks for the three things it cannot do itself — run a command, capture
 * what a command answered, and say what it is doing — and nothing else. That is the handler shape:
 * params in, `{run, capture, log}` passed as the second argument, a result out. A step never imports
 * `node:child_process`, never prints for itself, and never decides what to do about a failure, which
 * is why the same functions can be hosted by a realm and driven by a CLI or a test.
 *
 * `run` streams a command's output where the caller's terminal is (a build is read while it runs) and
 * throws on a non-zero status unless the caller says otherwise; `capture` keeps the output and hands
 * it back. Both name the command they failed on and the tail of its stderr, because the alternative
 * is a runbook that stops with a status and no line to read.
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';

/** One command, with what it answered. */
export interface ICommandResult {
    status: number;
    stdout: string;
    stderr: string;
}

export interface IRunOptions {
    cwd?: string;
    /** Environment *additions*; the caller's own environment is always underneath. */
    env?: Record<string, string | undefined>;
    /** A non-zero status is an answer rather than a failure (the `|| true` of a shell runbook). */
    allowFailure?: boolean;
    /**
     * Environment *removals*, for the calls that must not inherit a variable.
     *
     * A step that drops a variable usually cannot just leave it out: the framework the script drives
     * reads the environment itself, so `env: {…}` adds and only a name here removes.
     */
    unset?: string[];
    /**
     * Give up after this long, and say which command hung.
     *
     * A tool that waits on something that never happens — k3d creating a node whose container stays in
     * `Created`, a registry that is not answering — waits forever, and a run that hangs says nothing at
     * all. The timeout is the difference between a run that is slow and a run nobody can read (F-446).
     */
    timeoutMs?: number;
}

export type Runner = (command: string, args?: string[], options?: IRunOptions) => Promise<void>;
export type Capture = (command: string, args?: string[], options?: IRunOptions) => Promise<string>;

/** What every step is handed: the machine, and the words for the terminal. */
export interface IStepIo {
    /** Run it and let it talk: a build's progress, an apply's answer. */
    run: Runner;
    /** Run it and keep what it said. */
    capture: Capture;
    /** One line about what happened. */
    log: (message: string) => void;
    /** A section boundary: `== generate ==`. */
    say: (title: string) => void;
    /** Something the caller should know and the run does not fail on. */
    warn: (message: string) => void;
}

/** The run is refused before it starts, or a step decided it cannot continue. */
export class StepFailure extends Error {
    readonly code: number;

    constructor(message: string, code = 1) {
        super(message);
        this.name = 'StepFailure';
        this.code = code;
    }
}

/** Stop the run: the message is the whole report of what was wrong. */
export const fail = (message: string, code = 1): never => {
    throw new StepFailure(message, code);
};

/**
 * Hand every caller its command unwrapped, without rewriting it as one shell string.
 *
 * A runbook written in a shell is a runbook whose quoting is a variable: a name with a space, a
 * wildcard that the shell expands before the tool sees it, an argument that begins with a dash. Here
 * the command and its arguments are separate all the way down, so a namespace called `my suite` is a
 * name rather than two words.
 */
const spawnCommand = (
    command: string,
    args: string[],
    options: IRunOptions,
    stream: boolean,
): Promise<ICommandResult> =>
    new Promise((resolve, reject) => {
        const env = {...process.env, ...options.env};
        for (const name of options.unset ?? []) delete env[name];
        const child = spawn(command, args, {
            cwd: options.cwd,
            env,
            stdio: stream ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = options.timeoutMs
            ? setTimeout(() => {
                  timedOut = true;
                  child.kill('SIGKILL');
              }, options.timeoutMs)
            : undefined;
        if (!stream) {
            child.stdout?.on('data', chunk => (stdout += chunk));
            child.stderr?.on('data', chunk => (stderr += chunk));
        }
        child.on('error', error => {
            if (timer) clearTimeout(timer);
            reject(error);
        });
        child.on('close', status => {
            if (timer) clearTimeout(timer);
            if (timedOut) {
                reject(
                    new StepFailure(
                        `${command} ${args.join(' ')} did not answer within ${Math.round((options.timeoutMs ?? 0) / 1000)}s`,
                    ),
                );
                return;
            }
            resolve({status: status ?? 1, stdout, stderr});
        });
    });

/** The last few lines of a command's complaint, which is the part worth printing. */
const tail = (text: string, lines = 4): string => text.trim().split('\n').slice(-lines).join('\n');

/** An `io` that also keeps what it was told, which is what a test asserts on rather than stdout. */
export interface IIo extends IStepIo {
    lines: string[];
}

/**
 * The machine, and the words for the terminal.
 *
 * `quiet` sends those words to a list instead of the console: tap reads stdout, so a step that logged
 * its progress would be read as a test line and break its report. The lines are collected instead, and
 * a test asserts on what the step said — which is also what turns "it ran" into a claim a reader can
 * see the evidence for.
 *
 * `logger` sends them to the framework's own log instead, which is what a handler does: a run's
 * progress belongs in the log a reader already has open, and the command's stdout is left for its
 * result.
 */
export const createIo = ({
    quiet = false,
    logger,
}: {
    quiet?: boolean;
    logger?: {info: (message: string) => void; warn: (message: string) => void};
} = {}): IIo => {
    const lines: string[] = [];
    const say = (message: string): void => {
        if (logger) logger.info(message);
        else if (quiet) lines.push(message);
        else console.log(message);
    };
    const complain = (message: string): void => {
        if (logger) logger.warn(message);
        else if (quiet) lines.push(`WARN: ${message}`);
        else console.error(`WARN: ${message}`);
    };
    const invoke = async (
        stream: boolean,
        command: string,
        args: string[] = [],
        options: IRunOptions = {},
    ): Promise<ICommandResult> => {
        const result = await spawnCommand(command, args, options, stream);
        if (result.status !== 0 && !options.allowFailure) {
            const detail = tail(result.stderr || result.stdout);
            fail(
                `${command} ${args.join(' ')} answered ${result.status}` +
                    (detail ? `:\n${detail}` : ''),
            );
        }
        return result;
    };
    return {
        run: async (command, args, options) => {
            await invoke(true, command, args, options);
        },
        capture: async (command, args, options) =>
            (await invoke(false, command, args, options)).stdout,
        log: say,
        say: title => say(`== ${title} ==`),
        warn: complain,
        lines,
    };
};

/**
 * The io a handler gets: the machine, and the framework's logger rather than the console.
 *
 * A run's progress belongs in the log a reader already has open, and the command's stdout is left for
 * its result — which is the difference between a program that prints and a handler that reports.
 */
export const handlerIo = (context: unknown): IIo => {
    const log = (
        context as {
            log?: {info?: (message: string) => void; warn?: (message: string) => void};
        }
    ).log;
    return createIo({
        logger: {info: message => log?.info?.(message), warn: message => log?.warn?.(message)},
    });
};

/**
 * Whether a tool is on `PATH`, without asking a shell.
 *
 * `command -v` is a shell builtin, so a runbook that checked its tools by running it was really
 * checking that a shell was there. This walks the directories itself, which is also what makes the
 * check work when the caller's `PATH` is the interesting part.
 */
export const onPath = (tool: string, path = process.env['PATH'] ?? ''): boolean =>
    path
        .split(':')
        .filter(Boolean)
        .some(directory => existsSync(`${directory}/${tool}`));

/** Wait for something to become true, without a fixed sleep that is either slow or too short. */
export const waitFor = async (
    what: string,
    ready: () => Promise<boolean>,
    {timeoutMs = 30_000, intervalMs = 500}: {timeoutMs?: number; intervalMs?: number} = {},
): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await ready()) return;
        if (Date.now() > deadline) fail(`timed out waiting for ${what}`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
};

/**
 * Ask before a step that changes the machine.
 *
 * A caller that cannot answer is the one that asked for the whole cycle, so a run with no terminal
 * goes ahead and says so; `ASSUME_YES=1` skips the question deliberately, which is what CI does. The
 * questions are the ones the shell runbook asked, in the same places, for the same reason: creating a
 * cluster and creating a file server are the two steps that leave something behind.
 */
export const confirm = async (question: string): Promise<boolean> => {
    if (process.env['ASSUME_YES'] === '1') return true;
    if (!process.stdin.isTTY) {
        console.log(`   (no terminal to ask; running it) -- ${question}`);
        return true;
    }
    const rl = createInterface({input: process.stdin, output: process.stdout});
    const answer = await rl.question(`   ${question} [y/N] `);
    rl.close();
    return /^y/i.test(answer);
};
