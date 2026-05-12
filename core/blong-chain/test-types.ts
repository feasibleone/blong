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
export type StepFunction = (assert: unknown, context: ITestContext) => unknown | Promise<unknown>;

/**
 * Array of test steps that can be nested for sequential execution
 */
export type StepArray = (StepFunction | StepArray)[] & {name?: string};

/**
 * Meta information passed through test execution
 */
export interface IMeta {
    /** Optional concurrency limit for parallel step execution */
    concurrency?: number;
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
