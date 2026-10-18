/**
 * TestRun model helpers — pure reducer, derivation and recording utilities.
 *
 * Nothing here imports React or a platform module: the same functions are used by the fixture
 * replay, by the unit tests and (in phase 2) by a live source.
 */
import {progressTree} from '@feasibleone/blong-chain/browser.ts';
import type {
    ITestAssertionCounts,
    ITestEdgeModel,
    ITestGroupModel,
    ITestLogEntryModel,
    ITestLogRowModel,
    ITestRunCounts,
    ITestRunEvent,
    ITestRunModel,
    ITestRunRecording,
    ITestSourceLinkConfig,
    ITestSourcePointer,
    ITestStepModel,
    TestStepStatus,
} from '../../types/testRun.js';

export {progressTree};

export const EMPTY_ASSERTIONS: ITestAssertionCounts = {total: 0, threw: 0};

/** The status ordering used when a group aggregates its children. */
const STATUS_RANK: Record<TestStepStatus, number> = {
    pending: 0,
    running: 1,
    completed: 2,
    failed: 3,
};

export function emptyTestRun(partial: Partial<ITestRunModel> = {}): ITestRunModel {
    const run: ITestRunModel = {
        runId: 'empty',
        name: 'test run',
        method: 'test.run',
        host: 'browser',
        status: 'pending',
        startedAt: Date.now(),
        concurrency: 10,
        order: [],
        steps: {},
        edges: [],
        groups: [],
        counts: {total: 0, pending: 0, running: 0, completed: 0, failed: 0},
        assertions: {...EMPTY_ASSERTIONS},
        criticalPath: [],
        ...partial,
    };
    return deriveTestRun(run);
}

/** Group key used by the tree and by the collapse state. */
export const groupKey = (path: string[]): string => `group:${path.join('/')}`;
/** Step key used by the tree, selection and details. */
export const stepKey = (stepName: string): string => `step:${stepName}`;

/** The step names of a run, in declaration order, including any the order list missed. */
function orderedNames(run: ITestRunModel): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const name of run.order) {
        if (run.steps[name] && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    for (const name of Object.keys(run.steps)) {
        if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    return names;
}

function countSteps(steps: ITestStepModel[]): ITestRunCounts {
    const counts: ITestRunCounts = {
        total: steps.length,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
    };
    for (const step of steps) counts[step.status] += 1;
    return counts;
}

function sumAssertions(steps: ITestStepModel[]): ITestAssertionCounts {
    return steps.reduce<ITestAssertionCounts>(
        (total, step) => ({
            total: total.total + (step.assertions?.total ?? 0),
            threw: total.threw + (step.assertions?.threw ?? 0),
        }),
        {...EMPTY_ASSERTIONS},
    );
}

function groupStatus(steps: ITestStepModel[]): TestStepStatus {
    if (!steps.length) return 'pending';
    if (steps.some(step => step.status === 'failed')) return 'failed';
    if (steps.some(step => step.status === 'running')) return 'running';
    if (steps.some(step => step.status === 'pending')) {
        return steps.some(step => step.status === 'completed') ? 'running' : 'pending';
    }
    return 'completed';
}

function deriveGroups(run: ITestRunModel, steps: ITestStepModel[]): ITestGroupModel[] {
    const byPath = new Map<string, ITestStepModel[]>();
    for (const step of steps) {
        const key = groupKey(step.groupPath);
        const groupSteps = byPath.get(key);
        if (groupSteps) groupSteps.push(step);
        else byPath.set(key, [step]);
    }
    return Array.from(byPath.values()).map(groupSteps => {
        const path = groupSteps[0].groupPath;
        const counts = countSteps(groupSteps);
        return {
            groupName: path.length ? path[path.length - 1] : run.name,
            path,
            status: groupStatus(groupSteps),
            stepNames: groupSteps.map(step => step.stepName),
            totalSteps: counts.total,
            completedSteps: counts.completed,
            failedSteps: counts.failed,
        };
    });
}

/**
 * Recompute everything that is a function of the steps and edges.
 *
 * The executor reports counts and dependencies progressively; deriving them here keeps the view
 * consistent even when an event is missed, and keeps the reducer free of duplicated bookkeeping.
 */
export function deriveTestRun(run: ITestRunModel): ITestRunModel {
    const names = orderedNames(run);
    const dependents = new Map<string, Set<string>>();
    const dependencies = new Map<string, Set<string>>();
    for (const edge of run.edges) {
        if (!run.steps[edge.from] || !run.steps[edge.to]) continue;
        if (!dependents.has(edge.to)) dependents.set(edge.to, new Set());
        dependents.get(edge.to)!.add(edge.from);
        if (!dependencies.has(edge.from)) dependencies.set(edge.from, new Set());
        dependencies.get(edge.from)!.add(edge.to);
    }
    const steps: Record<string, ITestStepModel> = {};
    for (const name of names) {
        const step = run.steps[name];
        steps[name] = {
            ...step,
            dependencies: Array.from(dependencies.get(name) ?? step.dependencies ?? []),
            dependents: Array.from(dependents.get(name) ?? step.dependents ?? []),
        };
    }
    const stepList = names.map(name => steps[name]);
    const counts = countSteps(stepList);
    const anyFailed = stepList.some(step => step.status === 'failed');
    const anyRunning = stepList.some(step => step.status === 'running');
    const anyPending = stepList.some(step => step.status === 'pending');
    const allTerminal = stepList.every(
        step => step.status === 'completed' || step.status === 'failed',
    );
    let status = run.status;
    if (run.status !== 'pending') {
        if (run.error) status = 'failed';
        else if (stepList.length) {
            status = anyFailed ? 'failed' : anyRunning || anyPending ? 'running' : 'completed';
        }
    }
    const endedAt =
        allTerminal && stepList.length
            ? Math.max(...stepList.map(step => step.endedAt ?? 0), run.startedAt)
            : status === 'completed' || status === 'failed'
              ? run.endedAt
              : undefined;
    return {
        ...run,
        order: names,
        steps,
        counts,
        assertions: sumAssertions(stepList),
        groups: deriveGroups(run, stepList),
        status,
        endedAt,
    };
}

/** A model that has started but whose steps are all pending. */
export function pendingRun(run: ITestRunModel): ITestRunModel {
    const steps: Record<string, ITestStepModel> = {};
    for (const name of orderedNames(run)) {
        const step = run.steps[name];
        steps[name] = {
            ...step,
            status: 'pending',
            queuedAt: step.queuedAt ?? run.startedAt,
            startedAt: undefined,
            endedAt: undefined,
            queueTime: undefined,
            waitTime: undefined,
            executionTime: undefined,
            duration: undefined,
            assertions: {...EMPTY_ASSERTIONS},
            progress: undefined,
            result: undefined,
            resultTruncated: undefined,
            assertionLog: undefined,
            error: undefined,
        };
    }
    return deriveTestRun({
        ...run,
        status: 'running',
        endedAt: undefined,
        steps,
        edges: [],
        criticalPath: [],
        logs: [],
        error: undefined,
    });
}

function mergeEdges(
    existing: ITestEdgeModel[],
    incoming: ITestEdgeModel[],
    status?: ITestEdgeModel['status'],
): ITestEdgeModel[] {
    const byId = new Map(existing.map(edge => [edge.id, edge]));
    for (const edge of incoming) {
        const previous = byId.get(edge.id);
        byId.set(edge.id, {...previous, ...edge, status: status ?? edge.status});
    }
    return Array.from(byId.values());
}

/** Apply one event to the model. */
export function reduceTestRunEvent(run: ITestRunModel, event: ITestRunEvent): ITestRunModel {
    switch (event.kind) {
        case 'run:start':
        case 'run:snapshot':
        case 'run:end':
            return deriveTestRun(event.run);
        case 'step:start': {
            const step = {
                ...event.step,
                assertions: event.step.assertions ?? {...EMPTY_ASSERTIONS},
            };
            const edges = mergeEdges(run.edges, event.edges ?? [], 'active');
            return deriveTestRun({
                ...run,
                steps: {...run.steps, [step.stepName]: step},
                edges,
            });
        }
        case 'step:end':
        case 'step:error': {
            const step = {
                ...event.step,
                assertions: event.step.assertions ?? {...EMPTY_ASSERTIONS},
            };
            const edges = run.edges.map(edge =>
                edge.from === step.stepName ? {...edge, status: 'done' as const} : edge,
            );
            return deriveTestRun({
                ...run,
                steps: {...run.steps, [step.stepName]: step},
                edges,
            });
        }
        case 'step:dependency':
            return deriveTestRun({...run, edges: mergeEdges(run.edges, event.edges)});
        case 'log': {
            const logs: ITestLogEntryModel[] = [...(run.logs ?? []), event.entry].slice(-500);
            return {...run, logs};
        }
    }
}

export function applyTestRunEvents(
    run: ITestRunModel,
    events: Array<{event: ITestRunEvent}>,
): ITestRunModel {
    return events.reduce((model, entry) => reduceTestRunEvent(model, entry.event), run);
}

/**
 * A recording derived from a completed model.
 *
 * This is the phase 1 stand-in for a real recorder: the final timings are already in the model, so
 * the replay only has to put them in order. A failing step emits `step:error`; a completed one
 * emits `step:end`.
 */
export function recordingFromRun(
    run: ITestRunModel,
    source: {file: string; recordedAt?: number},
): ITestRunRecording {
    const initial = pendingRun(run);
    const events: Array<{at: number; event: ITestRunEvent; priority: number}> = [];
    let cursor = 0;
    const at = (time: number | undefined): number =>
        Math.max(0, (time ?? run.startedAt) - run.startedAt);
    events.push({
        at: 0,
        priority: 0,
        event: {kind: 'run:start', cursor: cursor++, run: initial},
    });
    for (const name of orderedNames(run)) {
        const step = run.steps[name];
        if (step.startedAt === undefined) continue;
        const startedAt = at(step.startedAt);
        const running: ITestStepModel = {
            ...step,
            status: 'running',
            endedAt: undefined,
            duration: undefined,
            executionTime: undefined,
            result: undefined,
            resultTruncated: undefined,
            error: undefined,
            assertions: {...EMPTY_ASSERTIONS},
            assertionLog: undefined,
        };
        events.push({
            at: startedAt,
            priority: 1,
            event: {
                kind: 'step:start',
                cursor: cursor++,
                step: running,
                counts: initial.counts,
                assertions: initial.assertions,
                edges: run.edges
                    .filter(edge => edge.from === name)
                    .map(edge => ({...edge, status: 'active' as const})),
            },
        });
        if (step.status === 'completed' || step.status === 'failed') {
            events.push({
                at: at(step.endedAt),
                priority: 2,
                event: {
                    kind: step.status === 'failed' ? 'step:error' : 'step:end',
                    cursor: cursor++,
                    step,
                    counts: run.counts,
                    assertions: run.assertions,
                },
            });
        }
    }
    events.push({
        at: at(run.endedAt),
        priority: 3,
        event: {kind: 'run:end', cursor: cursor++, run},
    });
    events.sort(
        (a, b) => a.at - b.at || a.priority - b.priority || a.event.cursor - b.event.cursor,
    );
    return {
        final: run,
        events: events.map((entry, index) => ({
            at: entry.at,
            event: {...entry.event, cursor: index + 1} as ITestRunEvent,
        })),
        source: {file: source.file, recordedAt: source.recordedAt ?? Date.now()},
    };
}

/** The model as it stood at `atMs` after the recording started. */
export function replayTo(recording: ITestRunRecording, atMs: number): ITestRunModel {
    const start = recording.events.find(entry => entry.event.kind === 'run:start');
    let model = start?.event.kind === 'run:start' ? start.event.run : pendingRun(recording.final);
    for (const entry of recording.events) {
        if (entry.at > atMs) break;
        model = reduceTestRunEvent(model, entry.event);
    }
    return model;
}

/** Total recorded duration, used by a replay control's seek. */
export function recordingDuration(recording: ITestRunRecording): number {
    return recording.events.reduce((max, entry) => Math.max(max, entry.at), 0);
}

/** `3/4` — assertions that passed out of the assertions the step made. */
export function assertionLabel(counts: ITestAssertionCounts | undefined): string {
    const total = counts?.total ?? 0;
    const threw = counts?.threw ?? 0;
    return `${Math.max(0, total - threw)}/${total}`;
}

export function assertionFailed(counts: ITestAssertionCounts | undefined): boolean {
    return (counts?.threw ?? 0) > 0;
}

/** A short label for a source pointer: `testSessionFlow.ts:42:5`. */
export function sourceLabel(source: ITestSourcePointer | undefined): string {
    if (!source?.file) return '';
    const name = source.file.split('/').pop() ?? source.file;
    const line = source.line === undefined ? '' : `:${source.line}`;
    const column = source.column === undefined ? '' : `:${source.column}`;
    return `${name}${line}${column}`;
}

/**
 * Turn a captured source pointer into an editor or web URL. A missing config
 * keeps the pointer unlinked; the scheme defaults from the base prefix and can be
 * overridden by config.
 */
export function sourceHref(
    source: ITestSourcePointer | undefined,
    config: ITestSourceLinkConfig | undefined,
): string | undefined {
    if (!source?.file || !config) return undefined;
    const {absolute, repoPath} = resolveSourcePath(source.file, config);
    const line = Math.max(1, source.line ?? 1);
    const column = Math.max(1, source.column ?? 1);
    const scheme =
        config.scheme ??
        (config.vscodeRemote || config.base?.startsWith('vscode://') ? 'vscode' : 'https');
    if (scheme === 'vscode') {
        const {prefix, root} = vscodeBase(config);
        const target = absolute ?? (repoPath && root ? `${root}/${repoPath}` : repoPath);
        if (!target) return undefined;
        const path = target.startsWith('/') ? target : `/${target}`;
        return `${prefix}${path}:${line}:${column}`;
    }
    const base = config.base?.trim().replace(/\/+$/, '');
    if (!base || !repoPath) return undefined;
    const root = /^https?:\/\//i.test(base) ? base : `https://${base}`;
    return `${root}/${repoPath}#L${line}`;
}

/** Repository folders that identify the start of a monorepo-relative path. */
const REPO_FOLDERS = new Set(['core', 'realm', 'suite', 'demo', 'test', 'tools', 'ext']);

/** The config injected by `defineBlongViteConfig`/`defineBlongStorybookMain`. */
interface IInjectedSourceLink {
    ci?: boolean;
    repository?: string;
    branch?: string;
    workspaceRoot?: string;
    packagePath?: string;
    vscodeRemote?: string;
}

/**
 * The source-link config for this build.
 *
 * DEV points at the editor (`vscode://file/<workspace path>`); a captured CI run
 * points at the branch the run came from. Absent (a build without the define)
 * leaves source pointers unlinked.
 */
export function defaultSourceLinkConfig(): ITestSourceLinkConfig | undefined {
    const injected = (globalThis as {__BLONG_SOURCE_LINK__?: IInjectedSourceLink})
        .__BLONG_SOURCE_LINK__;
    if (!injected) return undefined;
    const repository = injected.repository || 'feasibleone/blong';
    const branch = injected.branch || 'main';
    return {
        scheme: injected.ci ? 'https' : 'vscode',
        base: injected.ci ? `https://github.com/${repository}/blob/${branch}` : undefined,
        packagePath: injected.packagePath,
        workspaceRoot: injected.workspaceRoot,
        vscodeRemote: injected.vscodeRemote || undefined,
    };
}

/** The `vscode://` prefix and local workspace root a source pointer is joined to. */
function vscodeBase(config: ITestSourceLinkConfig): {prefix: string; root?: string} {
    const base = config.base?.trim().replace(/\/+$/, '');
    if (base?.startsWith('vscode://')) {
        const rest = base.slice('vscode://'.length);
        if (rest === 'file') return {prefix: 'vscode://file'};
        if (rest.startsWith('file/')) {
            return {prefix: 'vscode://file', root: rest.slice(4)};
        }
        return {prefix: base, root: config.workspaceRoot?.replace(/\/+$/, '')};
    }
    if (base?.startsWith('/')) return {prefix: 'vscode://file', root: base};
    const remote = config.vscodeRemote
        ?.trim()
        .replace(/^vscode:\/\//i, '')
        .replace(/\/+$/, '');
    const prefix = remote
        ? `vscode://${remote.includes('/') ? remote : `vscode-remote/${remote}`}`
        : 'vscode://file';
    return {prefix, root: config.workspaceRoot?.replace(/\/+$/, '')};
}

/** Split a captured file into an absolute path and a workspace-relative path. */
function resolveSourcePath(
    file: string,
    config: ITestSourceLinkConfig,
): {absolute?: string; repoPath?: string} {
    const raw = file.replace(/[?#].*$/, '');
    let absolute: string | undefined;
    let relativePath: string | undefined;
    if (raw.startsWith('file://')) {
        const path = decodeURIComponent(raw.slice('file://'.length));
        absolute = path.startsWith('/') ? path : `/${path}`;
    } else if (/^https?:\/\//i.test(raw)) {
        const match = /^https?:\/\/[^/]+\/s\/(.+)$/i.exec(raw);
        if (match) {
            const rest = decodeURIComponent(match[1]!);
            if (rest.startsWith('@fs/')) absolute = rest.slice(3);
            else relativePath = rest;
        } else {
            relativePath = raw.replace(/^https?:\/\/[^/]+\//i, '');
        }
    } else if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/')) {
        absolute = raw;
    } else {
        relativePath = raw;
    }

    if (relativePath && config.packagePath) {
        const first = relativePath.split('/')[0] ?? '';
        if (!REPO_FOLDERS.has(first) && !relativePath.startsWith(`${config.packagePath}/`)) {
            relativePath = `${config.packagePath}/${relativePath}`;
        }
    }

    const repoPath = relativePath
        ? relativePath.replace(/^\.?\/+/, '')
        : absolute
          ? workspaceRelative(absolute, config.workspaceRoot)
          : undefined;
    return {absolute, repoPath};
}

/** Strip the workspace root, or fall back to the last monorepo folder in the path. */
function workspaceRelative(absolute: string, workspaceRoot?: string): string | undefined {
    const normalized = absolute.replace(/\\/g, '/');
    const root = workspaceRoot?.replace(/\\/g, '/').replace(/\/+$/, '');
    if (root && (normalized === root || normalized.startsWith(`${root}/`))) {
        return normalized.slice(root.length + 1);
    }
    const segments = normalized.split('/').filter(Boolean);
    let start: number | undefined;
    for (let index = 0; index < segments.length - 1; index += 1) {
        if (REPO_FOLDERS.has(segments[index]!)) start = index;
    }
    return start === undefined ? undefined : segments.slice(start).join('/');
}

/**
 * The Log tab's stream: the executor's log lines plus the assertion messages, in time order. A
 * step filter keeps the run-level lines as context; without a step the whole run is shown.
 */
export function logRows(run: ITestRunModel, stepName?: string): ITestLogRowModel[] {
    const rows: ITestLogRowModel[] = [];
    for (const entry of run.logs ?? []) {
        if (stepName && entry.stepName && entry.stepName !== stepName) continue;
        rows.push({
            kind: 'log',
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message,
            stepName: entry.stepName,
            source: entry.source,
            data: entry.data,
        });
    }
    for (const name of stepName ? [stepName] : orderedNames(run)) {
        const step = run.steps[name];
        for (const assertion of step?.assertionLog ?? []) {
            rows.push({
                kind: 'assertion',
                timestamp: assertion.timestamp ?? step?.startedAt ?? run.startedAt,
                level: assertion.passed ? 'assert' : 'assert-failed',
                message: assertion.message,
                stepName: name,
                passed: assertion.passed,
                source: assertion.source,
            });
        }
    }
    return rows.sort(
        (a, b) =>
            a.timestamp - b.timestamp ||
            (a.stepName ?? '').localeCompare(b.stepName ?? '') ||
            a.message.localeCompare(b.message),
    );
}

export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms)) return '—';
    if (ms === 0) return '0 ms';
    if (ms < 10) return `${ms.toFixed(1)} ms`;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = ((ms % 60_000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
}

export function formatOffset(ms: number): string {
    if (ms < 1) return '0';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.round(ms / 1000)} s`;
}

export function statusRank(status: TestStepStatus): number {
    return STATUS_RANK[status];
}

/** The step names of a run in declaration order. */
export function stepNames(run: ITestRunModel): string[] {
    return orderedNames(run);
}
