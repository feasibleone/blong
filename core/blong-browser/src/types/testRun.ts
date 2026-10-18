/**
 * TestRun — draft wire model for the interactive test console.
 *
 * The model is deliberately JSON-safe: no `Map`, no `Set`, no `Error` instance, no function and no
 * `Date`. Times are epoch milliseconds. The shape is expected to change while the Storybook review
 * of the component is in progress; see `plans/test-ui/DATA_MODEL.md`.
 */
import type {IProgressEntry} from '@feasibleone/blong';
import type {ReactNode} from 'react';

export type TestRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TestStepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TestRunHost = 'browser' | 'server';
/** Tree order preserves groups; start order flattens the steps into start-time order. */
export type TestRunOrder = 'tree' | 'start';
export type TestRunFilter = 'all' | 'running' | 'failed' | 'slow';

/** Assertions a step made: calls, and how many of those threw. */
export interface ITestAssertionCounts {
    total: number;
    threw: number;
}

/**
 * Where a step or an assertion call is written. The pointer is captured with the run; turning it
 * into an editor or web URL is a separate, configurable step (`sourceHref`).
 */
export interface ITestSourcePointer {
    file: string;
    line?: number;
    column?: number;
    /** The handler or assertion helper that owns the line, when known. */
    symbol?: string;
}

/** How to turn a `ITestSourcePointer` into a URL. */
export interface ITestSourceLinkConfig {
    /** Repository root (https) or workspace root (vscode). Relative or absolute. */
    base?: string;
    /** Defaults from the base prefix: `vscode://` for vscode, `https://` otherwise. */
    scheme?: 'https' | 'vscode';
    /** Package path from the workspace root, for Vite paths served relative to `/s/`. */
    packagePath?: string;
    /** Absolute workspace root, used to join a package-relative source path. */
    workspaceRoot?: string;
    /**
     * The remote segment of a `vscode://` URI, e.g. `vscode-remote/ssh-remote+ms-02`.
     * Absent, a link opens the local `vscode://file/…` form.
     */
    vscodeRemote?: string;
}

/** One assertion message, kept so the Log can show it beside the executor log lines. */
export interface ITestAssertionModel {
    message: string;
    passed: boolean;
    /** Epoch milliseconds; defaults to the step start when the recorder did not stamp it. */
    timestamp?: number;
    source?: ITestSourcePointer;
}

export interface ITestStepError {
    message: string;
    stack?: string;
    /** Typed error name, e.g. `login.sessionRevoked`. */
    type?: string;
    /** True when the step asked for the failure through `$meta.expect`. */
    expected?: boolean;
    /** Context snapshot recorded by the executor, already truncated. */
    context?: Record<string, unknown>;
}

export interface ITestStepModel {
    /** Unique within the run: the executor step name. */
    stepName: string;
    displayName: string;
    groupPath: string[];
    status: TestStepStatus;
    queuedAt?: number;
    startedAt?: number;
    endedAt?: number;
    queueTime?: number;
    waitTime?: number;
    executionTime?: number;
    duration?: number;
    dependencies: string[];
    dependents: string[];
    assertions: ITestAssertionCounts;
    /** Checkpoints and branches the step announced, as the executor recorded them. */
    progress?: IProgressEntry[];
    result?: unknown;
    resultTruncated?: boolean;
    error?: ITestStepError;
    sourceLocation?: ITestSourcePointer;
    /** Assertion calls in execution order, with their messages and source pointers. */
    assertionLog?: ITestAssertionModel[];
    attempt?: number;
}

export interface ITestEdgeModel {
    /** Stable for React keys: `${from}->${to}:${property}`. */
    id: string;
    /** The dependent step (it read the property). */
    from: string;
    /** The step that produced the value that was read. */
    to: string;
    /** The context path that was read, e.g. `login.access_token`. */
    property: string;
    status: 'pending' | 'active' | 'done';
}

export interface ITestGroupModel {
    groupName: string;
    path: string[];
    status: TestStepStatus;
    stepNames: string[];
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
}

export interface ITestRunCounts {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
}

/** A log line; `logRows` interleaves the assertion messages into the same stream. */
export interface ITestLogEntryModel {
    timestamp: number;
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    message: string;
    stepName?: string;
    data?: Record<string, unknown>;
    source?: ITestSourcePointer;
}

/** One row of the Log tab: an executor log line or an assertion message. */
export interface ITestLogRowModel {
    kind: 'log' | 'assertion';
    timestamp: number;
    level: ITestLogEntryModel['level'] | 'assert' | 'assert-failed';
    message: string;
    stepName?: string;
    passed?: boolean;
    source?: ITestSourcePointer;
    data?: Record<string, unknown>;
}

/** One node of the checkpoint/branch tree a step announced. */
export interface ITestProgressTreeNode {
    name: string;
    kind: 'point' | 'region';
    data?: Record<string, unknown>;
    children: ITestProgressTreeNode[];
}

export interface ITestRunModel {
    /** ULID; the handle a server-hosted run is polled by. */
    runId: string;
    /** Display name of the scenario, e.g. `session flow`. */
    name: string;
    /** Wire name of the group, e.g. `test.session.flow`. */
    method: string;
    host: TestRunHost;
    status: TestRunStatus;
    startedAt: number;
    endedAt?: number;
    concurrency: number;
    /** The scenario could not be built. */
    error?: ITestStepError;
    /** Declaration order of the step names. */
    order: string[];
    steps: Record<string, ITestStepModel>;
    edges: ITestEdgeModel[];
    groups: ITestGroupModel[];
    counts: ITestRunCounts;
    assertions: ITestAssertionCounts;
    criticalPath: string[];
    logs?: ITestLogEntryModel[];
    source?: {file?: string; recordedAt?: number};
}

export type ITestRunEvent =
    | {kind: 'run:start'; cursor: number; run: ITestRunModel}
    | {kind: 'run:snapshot'; cursor: number; run: ITestRunModel}
    | {
          kind: 'step:start';
          cursor: number;
          step: ITestStepModel;
          counts: ITestRunCounts;
          assertions: ITestAssertionCounts;
          edges: ITestEdgeModel[];
      }
    | {
          kind: 'step:end';
          cursor: number;
          step: ITestStepModel;
          counts: ITestRunCounts;
          assertions: ITestAssertionCounts;
      }
    | {
          kind: 'step:error';
          cursor: number;
          step: ITestStepModel;
          counts: ITestRunCounts;
          assertions: ITestAssertionCounts;
      }
    | {kind: 'step:dependency'; cursor: number; edges: ITestEdgeModel[]}
    | {kind: 'run:end'; cursor: number; run: ITestRunModel}
    | {kind: 'log'; cursor: number; entry: ITestLogEntryModel};

export interface ITestRunRecording {
    final: ITestRunModel;
    events: Array<{at: number; event: ITestRunEvent}>;
    source: {file: string; recordedAt: number; speed?: number};
}

export interface ITestRunSource {
    snapshot(): ITestRunModel;
    subscribe(listener: (event: ITestRunEvent) => void): () => void;
    start?(): Promise<void>;
    stop?(): Promise<void>;
    controls?: {
        paused: boolean;
        speed: number;
        play(): void;
        pause(): void;
        setSpeed(speed: number): void;
        seek?(fraction: number): void;
    };
}

/** What the pure view receives. Selection, collapse and filters can be controlled or internal. */
export interface ITestRunViewProps {
    run: ITestRunModel;
    /** Override the internal clock on a running run (fixtures and tests). */
    now?: number;
    selectedKey?: string;
    hoveredKey?: string;
    detailsOpen?: boolean;
    defaultSelectedKey?: string;
    defaultDetailsOpen?: boolean;
    defaultCollapsed?: string[];
    defaultOrder?: TestRunOrder;
    defaultFilter?: TestRunFilter;
    onSelect?(stepName: string | undefined): void;
    onHover?(stepName: string | undefined): void;
    onToggleDetails?(open: boolean): void;
    /** Replay controls rendered in the status bar by the story or the page. */
    controls?: ReactNode;
    /** Base and scheme used to turn captured source pointers into links. */
    sourceLink?: ITestSourceLinkConfig;
    className?: string;
}

// ── Derived layout types (pure functions in testRunLayout.ts) ─────────────────

export interface ITestRunRowLayout {
    kind: 'group' | 'step';
    /** Group path joined, or the step name; unique in the table. */
    key: string;
    label: string;
    /** 0 for the root group; a step is one deeper than its group. */
    depth: number;
    groupPath: string[];
    stepName?: string;
    status: TestStepStatus;
    /** The row's own time envelope; a group spans all of its children. */
    span?: {start: number; queueEnd: number; end: number};
    duration?: number;
    assertions?: ITestAssertionCounts;
    /** A group's children in encounter order; absent on a step row. */
    childKeys?: string[];
    /** True when the group is collapsed; its children are not in `rows`. */
    collapsed?: boolean;
    /** Step rows hidden by this collapsed group or by a filter. */
    hiddenCount: number;
}

export interface ITestRunTreeLayout {
    t0: number;
    t1: number;
    ticks: Array<{at: number; label: string}>;
    /** Visible rows in draw order: a group, then its children, then the next group. */
    rows: ITestRunRowLayout[];
    /** Includes the rows hidden by collapsed groups and filters. */
    totalRows: number;
    /** Step rows only, in the same order as they appear in `rows`. */
    visibleSteps: string[];
}

export interface ITestGraphNodeLayout {
    stepName: string;
    label: string;
    level: number;
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ITestGraphEdgeLayout {
    edge: ITestEdgeModel;
    /** SVG path in the same coordinate space as the nodes. */
    path: string;
}

export interface ITestGraphLayout {
    width: number;
    height: number;
    nodes: ITestGraphNodeLayout[];
    edges: ITestGraphEdgeLayout[];
    byName: Record<string, ITestGraphNodeLayout>;
}
