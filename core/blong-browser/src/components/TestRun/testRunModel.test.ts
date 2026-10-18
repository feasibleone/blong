import {describe, expect, it} from 'vitest';
import {sessionFlowFailure, sessionFlowRecording, sessionFlowRun} from './fixtures/sessionFlow.js';
import {
    assertionLabel,
    defaultSourceLinkConfig,
    deriveTestRun,
    logRows,
    pendingRun,
    progressTree,
    recordingDuration,
    recordingFromRun,
    reduceTestRunEvent,
    replayTo,
    sourceHref,
    sourceLabel,
} from './testRunModel.js';

describe('recording and replay', () => {
    const run = sessionFlowRun();
    const recording = sessionFlowRecording();

    it('derives an ordered event list from a finished run', () => {
        expect(recording.events[0].event.kind).toBe('run:start');
        expect(recording.events[recording.events.length - 1].event.kind).toBe('run:end');
        const times = recording.events.map(entry => entry.at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(recordingDuration(recording)).toBe(812);
    });

    it('replays to a frozen mid-run state', () => {
        const mid = replayTo(recording, 520);
        expect(mid.status).toBe('running');
        expect(mid.counts).toMatchObject({total: 11, completed: 8, running: 1, pending: 2});
        expect(mid.steps.login.status).toBe('completed');
        expect(mid.steps.refreshToken.status).toBe('running');
        expect(mid.steps.reuseDetection.status).toBe('pending');
        expect(mid.edges.some(edge => edge.from === 'refreshToken')).toBe(true);
        expect(mid.edges.some(edge => edge.from === 'reuseDetection')).toBe(false);
    });

    it('reaches the final state at the end of the recording', () => {
        const final = replayTo(recording, 10_000);
        expect(final.status).toBe('completed');
        expect(final.counts.completed).toBe(11);
        expect(final.assertions.total).toBe(39);
        expect(final.assertions.threw).toBe(0);
    });

    it('derives the other direction of a dependency', () => {
        expect(run.steps.login.dependents).toContain('verifySession');
        expect(run.steps.verifySession.dependencies).toContain('login');
    });

    it('rejects an event for a step that has not run', () => {
        const pending = pendingRun(run);
        expect(pending.edges).toHaveLength(0);
        expect(pending.steps.login.status).toBe('pending');
        const started = reduceTestRunEvent(pending, {
            kind: 'step:start',
            cursor: 2,
            step: {...run.steps.login, status: 'running', endedAt: undefined},
            counts: pending.counts,
            assertions: pending.assertions,
            edges: [
                {
                    id: 'verifySession->login:login',
                    from: 'verifySession',
                    to: 'login',
                    property: 'login',
                    status: 'active',
                },
            ],
        });
        expect(started.steps.login.status).toBe('running');
        expect(started.status).toBe('running');
        expect(started.edges).toHaveLength(1);
    });

    it('takes a server snapshot as the new model', () => {
        const pending = pendingRun(run);
        const snapshot = {...run, host: 'server' as const};
        const next = reduceTestRunEvent(pending, {
            kind: 'run:snapshot',
            cursor: 1,
            run: snapshot,
        });
        expect(next.host).toBe('server');
        expect(next.status).toBe('completed');
        expect(next.counts.completed).toBe(11);
    });
});

describe('failure fixture', () => {
    const failed = sessionFlowFailure();

    it('counts failed steps separately from failed assertions', () => {
        expect(failed.status).toBe('failed');
        expect(failed.counts).toMatchObject({failed: 3, completed: 8});
        expect(failed.assertions).toEqual({total: 33, threw: 1});
        expect(assertionLabel(failed.steps.refreshToken.assertions)).toBe('5/6');
    });

    it('keeps the dependent steps failed with the propagated error', () => {
        expect(failed.steps.reuseDetection.error?.message).toContain('rotated refresh token');
        expect(failed.steps.revokedSession.error?.message).toContain('rotated refresh token');
    });
});

describe('model helpers', () => {
    it('builds the checkpoint tree of a step', () => {
        const tree = progressTree(sessionFlowRun().steps.login.progress);
        expect(tree).toHaveLength(1);
        expect(tree[0].kind).toBe('region');
        expect(tree[0].children).toHaveLength(1);
        expect(tree[0].children[0].name).toBe('session-created');
    });

    it('labels assertions as passed over total', () => {
        expect(assertionLabel({total: 4, threw: 1})).toBe('3/4');
        expect(assertionLabel({total: 0, threw: 0})).toBe('0/0');
        expect(assertionLabel(undefined)).toBe('0/0');
    });

    it('re-derives counts from the steps after an event', () => {
        const run = sessionFlowRun();
        const derived = deriveTestRun(run);
        expect(derived.counts).toEqual(run.counts);
        expect(derived.groups[0].totalSteps).toBe(11);
        expect(derived.groups[0].failedSteps).toBe(0);
    });

    it('can be recorded again from its own final model', () => {
        const second = recordingFromRun(sessionFlowRun(), {file: 'test'});
        expect(second.events[0].event.kind).toBe('run:start');
        expect(second.final.counts.total).toBe(11);
    });
});

describe('source pointers', () => {
    it('builds a web URL from a base and a pointer', () => {
        expect(
            sourceHref(
                {file: 'realm/x/test.ts', line: 12, column: 5},
                {scheme: 'https', base: 'https://github.com/org/repo/blob/main/'},
            ),
        ).toBe('https://github.com/org/repo/blob/main/realm/x/test.ts#L12');
        expect(
            sourceHref({file: '/realm/x/test.ts', line: 12}, {base: 'github.com/org/repo'}),
        ).toBe('https://github.com/org/repo/realm/x/test.ts#L12');
    });

    it('builds a vscode URL from a workspace root', () => {
        expect(
            sourceHref(
                {file: 'realm/x/test.ts', line: 12, column: 5},
                {scheme: 'vscode', base: 'vscode://file/home/kalin/work'},
            ),
        ).toBe('vscode://file/home/kalin/work/realm/x/test.ts:12:5');
        expect(
            sourceHref(
                {file: 'realm/x/test.ts', line: 3},
                {scheme: 'vscode', base: '/home/kalin/work'},
            ),
        ).toBe('vscode://file/home/kalin/work/realm/x/test.ts:3:1');
    });

    it('keeps the pointer unlinked without a base', () => {
        expect(sourceHref({file: 'x.ts'}, undefined)).toBeUndefined();
        expect(sourceLabel({file: 'realm/x/test.ts', line: 12, column: 5})).toBe('test.ts:12:5');
    });

    it('maps absolute and Vite paths to the workspace for vscode', () => {
        const config = {
            scheme: 'vscode' as const,
            workspaceRoot: '/home/kalin/work/blong/blong',
            packagePath: 'realm/blong-access',
        };
        expect(
            sourceHref(
                {file: 'file:///home/kalin/work/blong/blong/realm/blong-access/test/a.ts', line: 3},
                config,
            ),
        ).toBe('vscode://file/home/kalin/work/blong/blong/realm/blong-access/test/a.ts:3:1');
        expect(
            sourceHref(
                {file: 'http://localhost:5173/s/browser/test/testSessionFlow.ts', line: 9},
                config,
            ),
        ).toBe(
            'vscode://file/home/kalin/work/blong/blong/realm/blong-access/browser/test/testSessionFlow.ts:9:1',
        );
        expect(
            sourceHref(
                {file: 'http://localhost:5173/s/@fs/home/kalin/work/blong/blong/core/x.ts', line: 2},
                config,
            ),
        ).toBe('vscode://file/home/kalin/work/blong/blong/core/x.ts:2:1');
    });

    it('maps a CI pointer to the branch path', () => {
        expect(
            sourceHref(
                {file: 'file:///home/runner/work/blong/blong/realm/x/test.ts', line: 12},
                {
                    scheme: 'https',
                    base: 'https://github.com/feasibleone/blong/blob/feature/run',
                    packagePath: 'realm/x',
                },
            ),
        ).toBe('https://github.com/feasibleone/blong/blob/feature/run/realm/x/test.ts#L12');
    });

    it('uses a remote vscode authority', () => {
        expect(
            sourceHref(
                {file: 'file:///home/kalin/work/blong/blong/test/a.ts', line: 4},
                {scheme: 'vscode', vscodeRemote: 'vscode-remote/ssh-remote+ms-02'},
            ),
        ).toBe('vscode://vscode-remote/ssh-remote+ms-02/home/kalin/work/blong/blong/test/a.ts:4:1');
        expect(
            sourceHref(
                {file: 'http://localhost:5173/s/browser/test/x.ts', line: 2},
                {
                    scheme: 'vscode',
                    vscodeRemote: 'ssh-remote+ms-02',
                    workspaceRoot: '/home/kalin/work',
                    packagePath: 'realm/x',
                },
            ),
        ).toBe(
            'vscode://vscode-remote/ssh-remote+ms-02/home/kalin/work/realm/x/browser/test/x.ts:2:1',
        );
    });

    it('reads the injected DEV/CI source-link environment', () => {
        const injected = globalThis as {__BLONG_SOURCE_LINK__?: unknown};
        injected.__BLONG_SOURCE_LINK__ = {
            ci: true,
            repository: 'acme/blong',
            branch: 'feature/run',
            workspaceRoot: '/home/runner/work/blong/blong',
            packagePath: 'realm/x',
        };
        try {
            expect(defaultSourceLinkConfig()).toMatchObject({
                scheme: 'https',
                base: 'https://github.com/acme/blong/blob/feature/run',
                packagePath: 'realm/x',
            });
        } finally {
            delete injected.__BLONG_SOURCE_LINK__;
        }
    });
});

describe('log rows', () => {
    const run = sessionFlowRun();

    it('interleaves assertion messages with the step log', () => {
        const rows = logRows(run, 'login');
        const assertions = rows.filter(row => row.kind === 'assertion');
        expect(assertions).toHaveLength(5);
        expect(assertions[0].message).toBe('the session id is a ULID');
        expect(assertions[0].source?.file).toContain('testSessionFlow.ts');
        expect(rows.some(row => row.kind === 'log' && row.message === 'login dispatched')).toBe(
            true,
        );
    });

    it('shows the whole run when no step is selected', () => {
        const rows = logRows(run);
        expect(rows.filter(row => row.kind === 'assertion')).toHaveLength(39);
        const timestamps = rows.map(row => row.timestamp);
        expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    });

    it('keeps the failed assertion of the failure fixture', () => {
        const rows = logRows(sessionFlowFailure(), 'refreshToken');
        expect(
            rows.some(
                row =>
                    row.kind === 'assertion' &&
                    !row.passed &&
                    row.message === 'rotated refresh token is missing',
            ),
        ).toBe(true);
    });

    it('does not show assertions before they ran', () => {
        expect(pendingRun(run).steps.login.assertionLog).toBeUndefined();
        const mid = replayTo(sessionFlowRecording(), 520);
        expect(mid.steps.refreshToken.assertionLog).toBeUndefined();
    });
});
