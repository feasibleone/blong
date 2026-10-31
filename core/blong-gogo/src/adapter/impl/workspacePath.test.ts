import {test} from 'tap';

import {WorkspaceEscape, workspaceResolve, workspaceRootPath} from './workspacePath.ts';

/** The code a call refused with, which is what the realm maps to a typed error. */
const codeOf = (what: () => unknown): string | undefined => {
    try {
        what();
        return undefined;
    } catch (error) {
        return (error as {code?: string}).code;
    }
};

/**
 * The jail, without a filesystem.
 *
 * A model writing a parent path is the ordinary case, so the refusal is asserted at the boundary
 * rather than trusted to arrive from a handler (`@@D-710`).
 */
test('workspace.path stays inside the ticket', t => {
    const root = '/srv/agent';
    t.equal(
        workspaceRootPath(root, 'T-1001'),
        '/srv/agent/T-1001',
        'the ticket owns one directory',
    );
    t.equal(workspaceResolve(root, 'T-1001'), '/srv/agent/T-1001', 'and the root is its default');
    t.equal(
        workspaceResolve(root, 'T-1001', 'src/index.ts'),
        '/srv/agent/T-1001/src/index.ts',
        'a relative path resolves against it',
    );
    t.end();
});

test('workspace.path refuses a parent path', t => {
    const code = codeOf(() => workspaceResolve('/srv/agent', 'T-1001', '../T-1002/secrets'));
    t.equal(code, 'agent.workspaceEscape', 'a path that leaves the ticket is a coded refusal');
    t.end();
});

test('workspace.path refuses an absolute path rather than re-rooting it', t => {
    const code = codeOf(() => workspaceResolve('/srv/agent', 'T-1001', '/etc/passwd'));
    t.equal(code, 'agent.workspaceEscape', 'an absolute path is outside the ticket by definition');
    t.end();
});

test('workspace.path refuses a ticket id that is not a directory name', t => {
    for (const bad of ['..', '.', '../escape', 'a/b', ''])
        t.equal(
            codeOf(() => workspaceRootPath('/srv/agent', bad)),
            'agent.workspaceEscape',
            `${JSON.stringify(bad)} is not a ticket directory`,
        );
    t.ok(new WorkspaceEscape('x') instanceof WorkspaceEscape, 'the refusal is a class, not a code');
    t.end();
});
