/**
 * Phase 1 fixtures for the TestRun console.
 *
 * `sessionFlow` is hand-authored from
 * `realm/blong-access/server/test/test/testSessionFlow.ts`: 11 steps, two dependency chains, and
 * several independent steps running in parallel. A failure variant and a synthetic dense variant
 * cover the states the console must survive.
 */
import type {
    ITestAssertionModel,
    ITestEdgeModel,
    ITestRunModel,
    ITestRunRecording,
    ITestStepModel,
} from '../../../types/testRun.js';
import {deriveTestRun, recordingFromRun} from '../testRunModel.js';

const BASE = 1_760_000_000_000;
const SOURCE = 'realm/blong-access/server/test/test/testSessionFlow.ts';

const SOURCE_LINES: Record<string, number> = {
    login: 42,
    verifySession: 61,
    refreshToken: 80,
    reuseDetection: 101,
    revokedSession: 120,
    explicitClose: 141,
    inactivity: 161,
    cleanup: 180,
    auditLog: 199,
    loginActionRequired: 218,
    userInactiveRefusesRenewal: 237,
};

const ASSERTION_MESSAGES: Record<string, string[]> = {
    login: [
        'the session id is a ULID',
        'the access token has three segments',
        'the token expiry is in the future',
        'the permissions include accessTestPrivate',
        'the refresh token is opaque',
    ],
    verifySession: ['the session is active'],
    refreshToken: [
        'the refresh token rotated',
        'the old refresh token is gone',
        'the new access token is signed',
        'the session id is unchanged',
        'the rotation flag is set',
        'the reuse window is closed',
    ],
    reuseDetection: ['the reused token was refused', 'the failure is recorded'],
    explicitClose: [
        'the session is closed',
        'the access token is refused after close',
        'a second close is idempotent',
        'the close event is logged',
        'the refresh token is discarded',
        'the session row is gone',
    ],
    inactivity: ['the session expires after idle', 'the refresh is refused after expiry'],
    cleanup: ['the closed session left the table', 'the audit trail keeps the close event'],
    auditLog: [
        'the close event is in the audit log',
        'the audit entry names the session',
        'the audit entry is signed',
        'the audit write is durable',
        'the audit log is append only',
    ],
    loginActionRequired: ['the login action is required', 'the action is actionable'],
    userInactiveRefusesRenewal: [
        'the inactive user is refused',
        'the refusal names the user',
        'the refusal is recorded',
        'the refusal does not leak a token',
    ],
};

function assertionLogFor(name: string, start: number, count: number): ITestAssertionModel[] {
    const messages = ASSERTION_MESSAGES[name] ?? [];
    return Array.from({length: count}, (_, index) => ({
        message: messages[index] ?? `${name} assertion ${index + 1} passed`,
        passed: true,
        timestamp: BASE + start + index,
        source: {
            file: SOURCE,
            line: (SOURCE_LINES[name] ?? 1) + index + 2,
            column: 9,
            symbol: 'assert',
        },
    }));
}

function step(partial: Partial<ITestStepModel> & {stepName: string}): ITestStepModel {
    return {
        displayName: partial.stepName,
        groupPath: [],
        status: 'completed',
        queuedAt: BASE,
        dependencies: [],
        dependents: [],
        assertions: {total: 0, threw: 0},
        ...partial,
    };
}

function timed(
    name: string,
    start: number,
    end: number,
    assertions: number,
    extra: Partial<ITestStepModel> = {},
): ITestStepModel {
    return step({
        stepName: name,
        startedAt: BASE + start,
        endedAt: BASE + end,
        queueTime: start,
        executionTime: end - start,
        duration: end - start,
        assertions: {total: assertions, threw: 0},
        sourceLocation: {
            file: SOURCE,
            line: SOURCE_LINES[name] ?? 1,
            column: 5,
            symbol: name,
        },
        assertionLog: assertions > 0 ? assertionLogFor(name, start, assertions) : undefined,
        ...extra,
    });
}

function edge(from: string, to: string, property = to): ITestEdgeModel {
    return {id: `${from}->${to}:${property}`, from, to, property, status: 'done'};
}

function rawSessionFlow(): ITestRunModel {
    const order = [
        'login',
        'verifySession',
        'refreshToken',
        'reuseDetection',
        'revokedSession',
        'explicitClose',
        'inactivity',
        'cleanup',
        'auditLog',
        'loginActionRequired',
        'userInactiveRefusesRenewal',
    ];
    const steps: Record<string, ITestStepModel> = {
        login: timed('login', 0, 412, 5, {
            result: {
                sessionId: '0198f0c4-6d1a-7a1e-9a52-4b1f0d3f5a01',
                accessToken: 'eyJhbGciOiJIUzI1NiJ9.…',
                permissions: ['accessTestPrivate'],
            },
            progress: [
                {
                    kind: 'region',
                    discriminator: 'auth-method',
                    candidates: ['password', 'refresh'],
                    chosen: 'password',
                    values: {username: 'testUser'},
                },
                {
                    kind: 'point',
                    name: 'session-created',
                    data: {authMethod: 'password', permissions: 1},
                    timestamp: BASE + 380,
                    regions: [
                        {
                            discriminator: 'auth-method',
                            candidates: ['password', 'refresh'],
                            chosen: 'password',
                        },
                    ],
                },
            ],
        }),
        verifySession: timed('verifySession', 413, 509, 1, {
            dependencies: ['login'],
            result: {userId: '2f1c5a44-0f3e-4d2a-8f4b-6c7d8e9f0a11'},
        }),
        refreshToken: timed('refreshToken', 510, 618, 6, {
            dependencies: ['verifySession'],
            result: {sessionId: '0198f0c4-6d1a-7a1e-9a52-4b1f0d3f5a01', rotated: true},
        }),
        reuseDetection: timed('reuseDetection', 619, 704, 2, {
            dependencies: ['refreshToken'],
            progress: [
                {
                    kind: 'point',
                    name: 'reuse-detected',
                    data: {sessionId: '0198f0c4-6d1a-7a1e-9a52-4b1f0d3f5a01'},
                    timestamp: BASE + 660,
                },
            ],
        }),
        revokedSession: timed('revokedSession', 705, 812, 4, {
            dependencies: ['reuseDetection'],
        }),
        explicitClose: timed('explicitClose', 0, 201, 6),
        inactivity: timed('inactivity', 0, 96, 2),
        cleanup: timed('cleanup', 97, 133, 2, {dependencies: ['inactivity']}),
        auditLog: timed('auditLog', 30, 260, 5),
        loginActionRequired: timed('loginActionRequired', 10, 70, 2),
        userInactiveRefusesRenewal: timed('userInactiveRefusesRenewal', 40, 480, 4),
    };
    return deriveTestRun({
        runId: 'run-session-flow',
        name: 'session flow',
        method: 'test.session.flow',
        host: 'browser',
        status: 'completed',
        startedAt: BASE,
        endedAt: BASE + 812,
        concurrency: 10,
        order,
        steps,
        edges: [
            edge('verifySession', 'login'),
            edge('refreshToken', 'verifySession'),
            edge('reuseDetection', 'refreshToken'),
            edge('revokedSession', 'reuseDetection'),
            edge('cleanup', 'inactivity'),
        ],
        groups: [],
        counts: {total: 0, pending: 0, running: 0, completed: 0, failed: 0},
        assertions: {total: 0, threw: 0},
        criticalPath: [
            'login',
            'verifySession',
            'refreshToken',
            'reuseDetection',
            'revokedSession',
        ],
        logs: [
            {
                timestamp: BASE,
                level: 'info',
                message: 'run started',
                source: {file: SOURCE, line: 39, column: 9},
            },
            {
                timestamp: BASE + 4,
                level: 'debug',
                message: 'login dispatched',
                stepName: 'login',
                source: {file: SOURCE, line: 44, column: 9},
            },
            {
                timestamp: BASE + 380,
                level: 'info',
                message: 'session-created',
                stepName: 'login',
                source: {file: SOURCE, line: 55, column: 9},
            },
            {
                timestamp: BASE + 414,
                level: 'debug',
                message: 'session verified',
                stepName: 'verifySession',
                source: {file: SOURCE, line: 65, column: 9},
            },
            {
                timestamp: BASE + 620,
                level: 'warn',
                message: 'rotated refresh token reused',
                stepName: 'reuseDetection',
                source: {file: SOURCE, line: 105, column: 9},
            },
            {
                timestamp: BASE + 813,
                level: 'info',
                message: 'run completed',
                source: {file: SOURCE, line: 260, column: 9},
            },
        ],
        source: {file: SOURCE, recordedAt: BASE},
    });
}

let cachedSessionFlow: ITestRunModel | undefined;

export function sessionFlowRun(): ITestRunModel {
    cachedSessionFlow ??= rawSessionFlow();
    return cachedSessionFlow;
}

export function sessionFlowFailure(): ITestRunModel {
    const finished = sessionFlowRun();
    const steps = {...finished.steps};
    const error = {
        message: 'rotated refresh token is missing',
        type: 'login.invalidRefreshToken',
        context: {sessionId: '0198f0c4-6d1a-7a1e-9a52-4b1f0d3f5a01'},
    };
    steps.refreshToken = {
        ...steps.refreshToken,
        status: 'failed',
        endedAt: BASE + 618,
        executionTime: 108,
        duration: 108,
        assertions: {total: 6, threw: 1},
        assertionLog: [
            ...(steps.refreshToken.assertionLog ?? []).slice(0, 5),
            {
                message: 'rotated refresh token is missing',
                passed: false,
                timestamp: BASE + 618,
                source: {
                    file: SOURCE,
                    line: SOURCE_LINES.refreshToken + 8,
                    column: 9,
                    symbol: 'assert',
                },
            },
        ],
        error,
    };
    steps.reuseDetection = {
        ...steps.reuseDetection,
        status: 'failed',
        startedAt: BASE + 619,
        endedAt: BASE + 621,
        executionTime: 2,
        duration: 2,
        assertions: {total: 0, threw: 0},
        assertionLog: undefined,
        error,
    };
    steps.revokedSession = {
        ...steps.revokedSession,
        status: 'failed',
        startedAt: BASE + 622,
        endedAt: BASE + 624,
        executionTime: 2,
        duration: 2,
        assertions: {total: 0, threw: 0},
        assertionLog: undefined,
        error,
    };
    return deriveTestRun({
        ...finished,
        runId: 'run-session-flow-failure',
        status: 'failed',
        steps,
        edges: finished.edges.map(item =>
            item.from === 'refreshToken' || item.from === 'reuseDetection'
                ? {...item, status: 'done'}
                : item,
        ),
    });
}

export function sessionFlowRecording(): ITestRunRecording {
    cachedSessionFlowRecording ??= recordingFromRun(sessionFlowRun(), {
        file: SOURCE,
        recordedAt: BASE,
    });
    return cachedSessionFlowRecording;
}

let cachedSessionFlowRecording: ITestRunRecording | undefined;

let cachedFailureRecording: ITestRunRecording | undefined;

export function sessionFlowFailureRecording(): ITestRunRecording {
    cachedFailureRecording ??= recordingFromRun(sessionFlowFailure(), {
        file: SOURCE,
        recordedAt: BASE,
    });
    return cachedFailureRecording;
}

/** The same scenario before anything ran, for the Pending story. */
export function sessionFlowPending(): ITestRunModel {
    const finished = sessionFlowRun();
    const steps: Record<string, ITestStepModel> = {};
    for (const name of finished.order) {
        steps[name] = {
            ...finished.steps[name],
            status: 'pending',
            queuedAt: undefined,
            startedAt: undefined,
            endedAt: undefined,
            queueTime: undefined,
            waitTime: undefined,
            executionTime: undefined,
            duration: undefined,
            assertions: {total: 0, threw: 0},
            progress: undefined,
            result: undefined,
            assertionLog: undefined,
            error: undefined,
        };
    }
    return deriveTestRun({
        ...finished,
        runId: 'run-session-flow-pending',
        status: 'pending',
        endedAt: undefined,
        steps,
        edges: [],
        criticalPath: [],
    });
}

/** 40 synthetic steps in six groups, for the density story. */
export function denseRun(): ITestRunModel {
    const groups = ['setup', 'auth', 'transfer', 'audit', 'cleanup', 'report'];
    const sizes = [7, 7, 7, 7, 6, 6];
    const steps: Record<string, ITestStepModel> = {};
    const order: string[] = [];
    const edges: ITestEdgeModel[] = [];
    let cursor = 0;
    let previousGroupLast: string | undefined;
    groups.forEach((group, groupIndex) => {
        let previousStep: string | undefined;
        for (let index = 0; index < sizes[groupIndex]; index += 1) {
            const stepName = `${group}Step${index + 1}`;
            const dependsOn =
                previousStep ??
                (groupIndex > 0 && groupIndex % 2 === 1 ? previousGroupLast : undefined);
            const dependencyEnd = dependsOn ? (steps[dependsOn].endedAt ?? BASE) : BASE;
            const start = Math.max(cursor + index * 9, dependencyEnd - BASE + (dependsOn ? 6 : 0));
            const duration = 32 + ((groupIndex * 11 + index * 17) % 180);
            steps[stepName] = step({
                stepName,
                displayName: `${group} ${index + 1}`,
                groupPath: [group],
                startedAt: BASE + start,
                endedAt: BASE + start + duration,
                queueTime: start,
                executionTime: duration,
                duration,
                dependencies: dependsOn ? [dependsOn] : [],
                assertions: {total: 2 + ((groupIndex + index) % 6), threw: 0},
                result: {ok: true},
            });
            order.push(stepName);
            if (dependsOn) edges.push(edge(stepName, dependsOn));
            previousStep = stepName;
            cursor = start + duration + 6;
        }
        previousGroupLast = previousStep;
    });
    const endedAt = Math.max(...Object.values(steps).map(item => item.endedAt ?? BASE));
    return deriveTestRun({
        runId: 'run-dense',
        name: 'dense run',
        method: 'test.dense.flow',
        host: 'browser',
        status: 'completed',
        startedAt: BASE,
        endedAt,
        concurrency: 10,
        order,
        steps,
        edges,
        groups: [],
        counts: {total: 0, pending: 0, running: 0, completed: 0, failed: 0},
        assertions: {total: 0, threw: 0},
        criticalPath: Array.from({length: 7}, (_, index) => `transferStep${index + 1}`),
        logs: [],
        source: {file: 'plans/test-ui/PLAN.md', recordedAt: BASE},
    });
}

export function denseRecording(): ITestRunRecording {
    cachedDenseRecording ??= recordingFromRun(denseRun(), {
        file: 'dense fixture',
        recordedAt: BASE,
    });
    return cachedDenseRecording;
}

let cachedDenseRecording: ITestRunRecording | undefined;
