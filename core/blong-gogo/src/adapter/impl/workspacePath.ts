import {isAbsolute, resolve, sep} from 'node:path';

/**
 * A ticket's directory, and what may not be named inside it.
 *
 * Every path a tool hands in is resolved against the ticket root and refused if it leaves — a model
 * writing a parent path is the ordinary case, not the attack, which is why this is a refusal with a
 * code rather than a comment asking nicely (`@@D-710`).
 *
 * The ticket id is checked too: it becomes a directory name, and `..` there would move the root rather
 * than stay inside it.
 */
export class WorkspaceEscape extends Error {
    readonly code = 'agent.workspaceEscape';
    constructor(message: string) {
        super(message);
        this.name = 'WorkspaceEscape';
    }
}

/** What a command needs switched off, and where it may run. */
export class WorkspaceCommandDisabled extends Error {
    readonly code = 'agent.commandDisabled';
    constructor(message = 'running commands is disabled') {
        super(message);
        this.name = 'WorkspaceCommandDisabled';
    }
}

/** A command that outlived its timeout. */
export class WorkspaceCommandTimeout extends Error {
    readonly code = 'agent.commandTimeout';
    constructor(message: string) {
        super(message);
        this.name = 'WorkspaceCommandTimeout';
    }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The directory a ticket owns under the configured root. */
export const workspaceRootPath = (root: string, ticketId: string): string => {
    if (!SAFE_ID.test(ticketId) || ticketId === '.' || ticketId === '..')
        throw new WorkspaceEscape(`ticket id ${ticketId} is not a directory name`);
    return resolve(root, ticketId);
};

/**
 * The absolute path of `requested` inside a ticket workspace.
 *
 * An absolute request is refused rather than re-rooted: a caller that names one is describing a place
 * outside the ticket, and silently reading something else would answer a different question.
 */
export const workspaceResolve = (
    root: string,
    ticketId: string,
    requested: string = '.',
): string => {
    const base = workspaceRootPath(root, ticketId);
    if (isAbsolute(requested)) throw new WorkspaceEscape(`${requested} is an absolute path`);
    const full = resolve(base, requested);
    if (full !== base && !full.startsWith(base + sep))
        throw new WorkspaceEscape(`${requested} leaves the workspace of ${ticketId}`);
    return full;
};
