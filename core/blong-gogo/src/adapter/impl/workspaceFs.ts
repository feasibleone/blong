import {execFile, spawn} from 'node:child_process';
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {promisify} from 'node:util';

import {
    WorkspaceCommandDisabled,
    WorkspaceCommandTimeout,
    WorkspaceEscape,
    workspaceResolve,
    workspaceRootPath,
} from './workspacePath.ts';

const exec = promisify(execFile);

/**
 * What a ticket's workspace is: a directory, the files in it, and the one way a command runs there.
 *
 * The operations are pure functions of a configuration and a request, which is what lets them be
 * tested in a temporary directory without a platform (`@@D-710`). The adapter that carries them is a
 * binding, not a second implementation.
 *
 * A command is `execFile` with an argv array and never a shell, it runs with the ticket directory as
 * its cwd, it is killed with its process group when it outlives the timeout, its output is capped, and
 * its environment is a configured allowlist rather than everything this process holds — because a
 * build tool that reads a model key out of the environment is the failure this prevents.
 */
export interface IWorkspaceConfig {
    /** Where every ticket's directory lives. */
    root: string;
    /** A directory copied into a fresh workspace, when one is configured. */
    template?: string;
    shell?: {
        /** Off unless a deployment says otherwise. */
        enabled?: boolean;
        timeoutMs?: number;
        /** Bytes of combined output kept; the rest is dropped rather than buffered. */
        maxOutputBytes?: number;
        /** Environment names a command is allowed to see. `PATH` is always passed. */
        env?: Record<string, string>;
    };
}

export interface IWorkspaceCommand {
    ticketId: string;
    command: string;
    args?: string[];
    /** A relative path inside the ticket, or the ticket root. */
    path?: string;
    timeoutMs?: number;
}

export interface IWorkspaceCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_OUTPUT = 200_000;

/** A fresh workspace: the directory, and the template's contents when one is configured. */
export const workspacePrepare = async (
    config: IWorkspaceConfig,
    params: {ticketId: string},
): Promise<{workspacePath: string; baseCommit?: string}> => {
    const base = workspaceRootPath(config.root, params.ticketId);
    await mkdir(base, {recursive: true});
    if (config.template) {
        const empty = (await readdir(base)).length === 0;
        if (empty) await cp(config.template, base, {recursive: true});
    }
    return {workspacePath: base, ...(await baseCommitOf(base))};
};

/** The commit a rollback would return to, when the workspace is a repository. */
export const baseCommitOf = async (workspacePath: string): Promise<{baseCommit?: string}> => {
    try {
        const {stdout} = await exec('git', ['rev-parse', 'HEAD'], {cwd: workspacePath});
        return {baseCommit: stdout.trim()};
    } catch {
        // Not a repository is an ordinary state: the template was a directory, not a checkout.
        return {};
    }
};

export const workspaceRead = async (
    config: IWorkspaceConfig,
    params: {ticketId: string; path: string},
): Promise<{content: string}> => ({
    content: await readFile(workspaceResolve(config.root, params.ticketId, params.path), 'utf8'),
});

export const workspaceWrite = async (
    config: IWorkspaceConfig,
    params: {ticketId: string; path: string; content: string},
): Promise<{path: string; bytes: number}> => {
    const full = workspaceResolve(config.root, params.ticketId, params.path);
    await mkdir(dirname(full), {recursive: true});
    await writeFile(full, params.content, 'utf8');
    return {path: full, bytes: Buffer.byteLength(params.content)};
};

export const workspaceList = async (
    config: IWorkspaceConfig,
    params: {ticketId: string; path?: string},
): Promise<{
    entries: Array<{name: string; kind: 'file' | 'directory' | 'other'; bytes?: number}>;
}> => {
    const full = workspaceResolve(config.root, params.ticketId, params.path);
    const dirents = await readdir(full, {withFileTypes: true});
    const entries = await Promise.all(
        dirents.map(async dirent => {
            const kind = dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : 'other';
            if (kind !== 'file') return {name: dirent.name, kind} as const;
            const stats = await stat(`${full}/${dirent.name}`);
            return {name: dirent.name, kind, bytes: stats.size} as const;
        }),
    );
    return {entries};
};

/**
 * One command, in the ticket directory, with no shell in between.
 *
 * `detached` is what makes the timeout able to kill a process *group*: a build that spawns children
 * would otherwise leave them running after its parent is gone.
 */
export const workspaceRun = async (
    config: IWorkspaceConfig,
    params: IWorkspaceCommand,
): Promise<IWorkspaceCommandResult> => {
    const shell = config.shell ?? {};
    if (shell.enabled !== true) throw new WorkspaceCommandDisabled();
    const cwd = workspaceResolve(config.root, params.ticketId, params.path);
    const timeoutMs = params.timeoutMs ?? shell.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutput = shell.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const env: Record<string, string> = {
        ...(process.env.PATH && {PATH: process.env.PATH}),
        ...(shell.env ?? {}),
    };
    return await new Promise<IWorkspaceCommandResult>((resolve, reject) => {
        const child = spawn(params.command, params.args ?? [], {
            cwd,
            env,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let truncated = false;
        const keep = (into: string, chunk: Buffer): string => {
            if (into.length >= maxOutput) {
                truncated = true;
                return into;
            }
            return into + chunk.toString('utf8').slice(0, maxOutput - into.length);
        };
        child.stdout?.on('data', chunk => (stdout = keep(stdout, chunk as Buffer)));
        child.stderr?.on('data', chunk => (stderr = keep(stderr, chunk as Buffer)));
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (child.pid !== undefined) {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch {
                    child.kill('SIGKILL');
                }
            }
            reject(
                new WorkspaceCommandTimeout(`${params.command} timed out after ${timeoutMs} ms`),
            );
        }, timeoutMs);
        timer.unref?.();
        child.on('error', error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({exitCode: code ?? -1, stdout, stderr, truncated});
        });
    });
};

/** Back to the state the workspace started in: tracked files restored, untracked ones removed. */
export const workspaceRollback = async (
    config: IWorkspaceConfig,
    params: {ticketId: string; baseCommit?: string},
): Promise<{restored: boolean; baseCommit?: string}> => {
    const cwd = workspaceRootPath(config.root, params.ticketId);
    try {
        await exec('git', ['checkout', '--', '.'], {cwd});
        await exec('git', ['clean', '-fd'], {cwd});
        if (params.baseCommit) await exec('git', ['reset', '--hard', params.baseCommit], {cwd});
        return {restored: true, ...(params.baseCommit && {baseCommit: params.baseCommit})};
    } catch {
        return {restored: false};
    }
};

/** Purge a ticket's directory — what a refused recovery does (`@@D-705`). */
export const workspaceRemove = async (
    config: IWorkspaceConfig,
    params: {ticketId: string},
): Promise<{removed: boolean; workspacePath: string}> => {
    const base = workspaceRootPath(config.root, params.ticketId);
    await rm(base, {recursive: true, force: true});
    return {removed: true, workspacePath: base};
};

export {WorkspaceEscape};
