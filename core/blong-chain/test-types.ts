import nodeAssert from 'node:assert';

declare module 'node:assert' {
    function snapshot(value?: unknown, name?: string, opts?: {mask?: string[]}): void;
}

/**
 * Type definitions for the Blong parallel test framework
 */

// ============================================================================
// Logger Interface
// ============================================================================

/** Minimal logger interface compatible with the framework's ILogger */
export interface ITestLogger {
    trace?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    fatal?: (...args: unknown[]) => void;
}

// ============================================================================
// Step Function Types
// ============================================================================

/**
 * Context object passed to test step functions.
 * All properties except $meta are thenable proxies that must be awaited.
 */
export interface ITestContext {
    /** Meta information - always available directly (not a thenable proxy) */
    $meta: IMeta;
    /** Dynamic properties added by completed steps - accessed via thenable proxies */
    [key: string]: unknown;
}

/**
 * A single test step function
 * @param assert - Assertion functions from node:assert or tap
 * @param context - Test context with $meta and outputs from previous steps
 * @returns The output to be stored in context under the function's name
 */
export type StepFunction = (
    assert: typeof nodeAssert,
    context: ITestContext,
) => unknown | Promise<unknown>;

/**
 * A snapshot marker — an array of step-name strings placed inside the
 * steps array. At runtime, when the executor encounters it the relevant steps
 * are awaited and their results snapshotted into the TAP context.
 *
 * - `['*']`            — snapshot ALL completed steps' results into one context object
 * - `['step1', 'step2']` — snapshot only those specific steps
 * - `[]`               — sync barrier only, no snapshot (the empty array is the spelling;
 *                        there is no symbol for it, because inventing one would touch every
 *                        call site for no gain)
 *
 * The array may carry an optional `.name` to give the snapshot a stable name:
 * ```
 * const marker = Object.assign(['*'], {name: 'provisioning-complete'});
 * ```
 */
export type SnapshotMarker = string[] & {name?: string};

/**
 * Array of test steps. May contain step functions, nested step groups, or
 * snapshot markers (string arrays; `[]` being a sync barrier).
 */
export type StepArray = (StepFunction | StepArray | SnapshotMarker)[] & {name?: string};

/**
 * Meta information passed through test execution
 */
export interface IMeta {
    /** Optional concurrency limit for parallel step execution */
    concurrency?: number;
    /**
     * What the invocation has announced so far, in the order it announced it (PRD R26/R27).
     *
     * The same array a framework dispatch keeps on its own `$meta`: the handlers a step calls
     * are handed this object, so whatever they announce while it runs appears here — which is
     * the only place the executor can read a step's progress from, and why it reads it at the
     * step's boundaries.
     */
    progress?: IProgressEntry[];
    /** Additional metadata properties */
    [key: string]: unknown;
}

/**
 * Test framework context (e.g., from node:test or tap)
 * Enables nested test output with automatic indentation
 */
export interface ITestFrameworkContext {
    /** Creates a nested test scope for proper indentation */
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown;
    /**
     * Writes a comment into the run's output (`# …` in TAP).
     *
     * What a point is reported as: a moment a step passed through is not a test,
     * so it does not deserve a sub-test of its own — but it is what a reader
     * wants to see beside the step, which is what a comment is.
     */
    comment?: (text: string) => void;
    /** Captures a snapshot of a value under the given name */
    matchSnapshot?: (value: unknown, name: string) => void;
}

// ============================================================================
// Thenable Proxy Types
// ============================================================================

/**
 * A thenable proxy that acts as both a Promise and supports property access.
 * Used for automatic dependency detection in test steps.
 *
 * Note: This is a conceptual type. The actual implementation uses Proxy objects
 * that intercept property access. TypeScript cannot perfectly represent this pattern.
 */
export type IThenableProxy<T = unknown> = Promise<T> & {
    /** Access nested properties, returning more thenable proxies */
    [key: string]: IThenableProxy<unknown>;
};

/**
 * Promise resolution tracking for a specific context path
 */
export interface IPromiseEntry<T = unknown> {
    /** The actual promise that resolves when the step completes */
    promise: Promise<T>;
    /** Function to resolve the promise with a value */
    resolve: (value: T) => void;
    /** Function to reject the promise with an error */
    reject: (error: Error) => void;
}

// ============================================================================
// Step Definition Types
// ============================================================================

/**
 * Complete definition of a test step including metadata
 */
export interface IStepDefinition {
    /** The step function to execute */
    fn: StepFunction;
    /** The step's display name (function name or custom name) */
    name: string;
    /** Source code location where this step was defined */
    sourceLocation: ISourceLocation;
    /** Parent group hierarchy */
    groupPath: string[];
}

/**
 * Source code location information
 */
export interface ISourceLocation {
    /** Absolute file path */
    file: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (1-indexed) */
    column: number;
    /** Optional code snippet for context */
    snippet?: string;
}

// ============================================================================
// Dependency Graph Types
// ============================================================================

/**
 * Graph structure tracking dependencies between test steps
 */
export interface IDependencyGraph {
    /** All steps in the test as graph nodes */
    nodes: Map<string, IDependencyNode>;
    /** Dependency relationships between steps */
    edges: IDependencyEdge[];
}

/**
 * A single node in the dependency graph
 */
export interface IDependencyNode {
    /** Step name (unique identifier) */
    stepName: string;
    /** Hierarchy of group names this step belongs to */
    groupPath: string[];
    /** When step execution started (timestamp) */
    startTime?: number;
    /** When step execution finished (timestamp) */
    endTime?: number;
    /** Current execution status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** Error if step failed */
    error?: Error;
}

/**
 * An edge representing a dependency relationship
 */
export interface IDependencyEdge {
    /** Step that depends on another step */
    from: string;
    /** Step being depended on */
    to: string;
    /** Which context property/path was accessed */
    property: string;
}

// ============================================================================
// Progress Tracking Types
// ============================================================================

/**
 * A branch as a progress entry names it (PRD R11/R26).
 *
 * Declared structurally here, matching the framework's own declaration in
 * `core/blong/types.ts` the way {@link IMeta} does, because this package stands at the bottom
 * of the dependency graph with `p-queue` as its only dependency. The names are what a report
 * groups by; the position a log mints for itself is deliberately not here.
 */
export interface IRegionMark {
    /** What the branch was about, stable across runs. */
    discriminator: string;
    /** Every candidate considered, in evaluation order. */
    candidates: string[];
    /** The branch taken, or `none` when none of them matched. */
    chosen: string;
}

/** A milestone an invocation announced (PRD R26). */
export interface IProgressPoint {
    /** Which of the two shapes this entry is; one array holds both. */
    kind: 'point';
    /** Stable name of the moment, e.g. `total-calculated`. */
    name: string;
    /** What was true there; kept locally, exactly as a record keeps it. */
    data?: unknown;
    /** When it was announced, in epoch milliseconds. */
    timestamp: number;
    /** The branches it was announced *inside*, outermost first. */
    regions?: IRegionMark[];
}

/** A branch the invocation took, in the same array as the points (PRD R11/R26). */
export interface IProgressRegion extends IRegionMark {
    /** Which of the two shapes this entry is; one array holds both. */
    kind: 'region';
    /** The values the decision was made from. */
    values: Record<string, unknown>;
    /** The branches this one was itself taken inside, outermost first. */
    regions?: IRegionMark[];
}

/** One entry of an invocation's `progress` list. */
export type IProgressEntry = IProgressPoint | IProgressRegion;

/**
 * One node of the progress tree a report is drawn from (PRD R26/R27).
 *
 * `name` is the display name rather than the raw entry, so both renderers label a branch the
 * same way: `<discriminator> = <chosen>` for a region, the point's own name for a point.
 */
export interface IProgressNode {
    /** What a report calls it: the point's name, or `<discriminator> = <chosen>`. */
    name: string;
    /** Which of the two shapes it is. */
    kind: 'point' | 'region';
    /**
     * What the point announced, printed beside it when it is small enough to read.
     *
     * A branch carries none: what it has to say is its name.
     */
    data?: Record<string, unknown>;
    /** The points and branches announced inside it, in the order they were announced. */
    children: IProgressNode[];
}

/**
 * Overall test execution progress
 */
export interface ITestProgress {
    /** Test name */
    testName: string;
    /** Test start time */
    startTime: number;
    /** Test end time (when all steps complete) */
    endTime?: number;
    /** Overall test status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** Total number of steps in the test */
    totalSteps: number;
    /** Number of completed steps */
    completedSteps: number;
    /** Number of failed steps */
    failedSteps: number;
    /** Progress details for each step */
    steps: Map<string, IStepProgress>;
    /** Group hierarchy information */
    groups: IGroupProgress[];
}

/**
 * Progress information for a single step
 */
export interface IStepProgress {
    /** Step name */
    stepName: string;
    /** Display name (may differ from stepName for reused tests) */
    displayName: string;
    /** Group hierarchy path */
    groupPath: string[];
    /** Current step status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** When step started executing */
    startTime?: number;
    /** When step finished executing */
    endTime?: number;
    /** Total duration (end - start) */
    duration?: number;
    /** Time spent waiting in queue before execution */
    queueTime?: number;
    /** Time spent actually executing the step function */
    executionTime?: number;
    /** Time spent waiting for dependencies to resolve */
    waitTime?: number;
    /** Steps this step depends on */
    dependencies: string[];
    /** Steps that depend on this step */
    dependents: string[];
    /** Source code location */
    sourceLocation?: ISourceLocation;
    /** Step output/result */
    result?: unknown;
    /** Error information if step failed */
    error?: IStepError;
    /**
     * What this step announced while it ran (PRD R26/R27), or absent when it announced
     * nothing.
     *
     * Read from the invocation's own list at the step's boundaries rather than reported by the
     * step: the handlers it called announced into the `$meta` every step shares, so the window
     * is the only thing that attributes a point to the step that made it. A report draws these
     * as the step's nested steps — a point as a step, a branch as the group of the points
     * taken inside it.
     */
    progress?: IProgressEntry[];
}

/**
 * Error information with enhanced context
 */
export interface IStepError {
    /** Error message */
    message: string;
    /** Stack trace */
    stack: string;
    /** Context snapshot at time of failure */
    context: Record<string, unknown>;
}

/**
 * Progress information for a group of steps
 */
export interface IGroupProgress {
    /** Group name */
    groupName: string;
    /** Hierarchy path */
    path: string[];
    /** Group status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** Step names in this group */
    steps: string[];
    /** Total steps in group */
    totalSteps: number;
    /** Completed steps in group */
    completedSteps: number;
}

// ============================================================================
// Latency Tracking Types
// ============================================================================

/**
 * Detailed timing information for a step
 */
export interface IStepLatency {
    /** Step name */
    stepName: string;
    /** When step was added to queue */
    queuedAt: number;
    /** When step execution started */
    startedAt?: number;
    /** When step execution completed */
    completedAt?: number;
    /** Time from queue entry to execution start */
    queueTime: number;
    /** Time spent waiting for dependencies */
    waitTime: number;
    /** Actual execution time (excludes wait time) */
    executionTime: number;
    /** Total time from queue to completion */
    totalTime: number;
}

/**
 * Aggregate latency metrics for entire test
 */
export interface ITestLatency {
    /** Test name */
    testName: string;
    /** Total wall-clock duration */
    totalDuration: number;
    /** Latency details for each step */
    steps: Map<string, IStepLatency>;
    /** Steps on the critical path (longest dependency chain) */
    criticalPath: string[];
    /** Ratio of parallel efficiency (total step time / wall clock time) */
    parallelEfficiency: number;
    /** Steps that blocked the most other steps */
    bottlenecks: Array<{
        stepName: string;
        executionTime: number;
        blockedSteps: string[];
    }>;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event emitter interface for progress notifications
 */
export interface ITestEvents {
    'test:start': (progress: ITestProgress) => void;
    'test:end': (progress: ITestProgress) => void;
    'step:start': (stepName: string, progress: IStepProgress) => void;
    'step:end': (stepName: string, progress: IStepProgress) => void;
    'step:error': (stepName: string, error: Error, progress: IStepProgress) => void;
}

// ============================================================================
// Test Executor Configuration
// ============================================================================

/**
 * Configuration for the parallel test executor
 */
export interface ITestExecutorConfig {
    /** Maximum number of steps to run in parallel */
    concurrency?: number;
    /** Whether to capture stack traces (performance impact) */
    captureStackTraces?: boolean;
    /** Test framework to use (tap, node:test, etc.) */
    framework?: unknown;
    /** Logger instance for reporting step failures */
    log?: ITestLogger;
    /**
     * Chain-level mask paths. Applied to ALL snapshot operations in this chain:
     * `autoSnapshot`, `assert.snapshot()`, and snapshot markers.
     *
     * Supports:
     * - Simple name: `'id'` — masks the `id` field in the snapshotted value
     * - Dot-path: `'user.id'` — masks a nested field
     * - Wildcard prefix: `'*.id'` — masks `id` inside every direct child of the
     *   snapshotted object (useful for context-level snapshots where each child
     *   is a step result)
     *
     * Per-call `{mask: [...]}` options are merged on top of this chain-level mask.
     */
    mask?: string[];
    /**
     * When `true`, automatically snapshot every step's return value under the
     * step's function name after it completes. The chain-level `mask` is applied
     * before snapshotting. No `assert.snapshot()` calls are needed in step
     * functions — the framework captures everything automatically.
     *
     * Requires a TAP (or compatible) test context to be passed to `execute()`.
     */
    autoSnapshot?: boolean;
    /**
     * @deprecated Use `mask` (string array) instead.
     * Custom masking function for advanced scenarios not covered by `mask`.
     * When both are provided, `maskFn` is used and `mask` is passed to it.
     */
    maskFn?: (value: unknown, paths: string[]) => unknown;
    /**
     * Automatic rerun configuration for failing steps (Phase 1).
     *
     * When enabled, a step that throws an error is retried up to `maxRetries`
     * times before being reported as failed. This is useful for flaky tests
     * caused by race conditions or transient network issues.
     *
     * Phase 2 (diagnostic attachment) is not yet implemented.
     */
    rerun?: {
        /** Whether to enable the retry mechanism (default: false) */
        enabled?: boolean;
        /**
         * Maximum number of retry attempts per failing step (default: 1).
         * Set to 0 to detect failures without retrying.
         */
        maxRetries?: number;
    };
}

/**
 * Test executor interface
 */
export interface ITestExecutor {
    /** Execute test steps */
    execute(steps: StepArray, $meta: IMeta, testContext?: ITestFrameworkContext): Promise<void>;
    /** Get current progress snapshot */
    getProgress(): ITestProgress;
    /** Get dependency graph */
    getDependencyGraph(): IDependencyGraph;
    /** Get latency metrics */
    getLatencyReport(): ITestLatency;
    /** Register event listener */
    on<E extends keyof ITestEvents>(event: E, handler: ITestEvents[E]): void;
}
