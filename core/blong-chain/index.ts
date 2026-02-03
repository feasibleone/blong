/**
 * Parallel Test Executor
 *
 * Implements the new parallel test execution framework with:
 * - Thenable proxies for automatic dependency detection
 * - Parallel execution with configurable concurrency
 * - Dependency graph tracking
 * - Live progress tracking
 * - Enhanced error reporting
 * - Latency metrics
 */

import assert from 'node:assert';
import {EventEmitter} from 'node:events';
import PQueue from 'p-queue';
import type {
    IDependencyEdge,
    IDependencyGraph,
    IMeta,
    IPromiseEntry,
    ISourceLocation,
    IStepError,
    IStepLatency,
    IStepProgress,
    ITestContext,
    ITestEvents,
    ITestExecutorConfig,
    ITestLatency,
    ITestProgress,
    IThenableProxy,
    StepArray,
    StepFunction,
} from './test-types.js';

/**
 * Creates a thenable proxy for a given context path.
 * The proxy acts as a Promise and supports nested property access.
 *
 * @param path - The context path (e.g., 'setupData' or 'setupData.user.name')
 * @param promiseManager - The promise manager to get/create promises
 * @returns A thenable proxy that can be awaited or have properties accessed
 */
function createThenableProxy<T = unknown>(
    path: string,
    promiseManager: PromiseManager,
): IThenableProxy<T> {
    // Get or create the promise for this path
    const promiseEntry = promiseManager.getOrCreate(path);

    // Create a proxy that intercepts property access
    const proxy = new Proxy(promiseEntry.promise as any, {
        get(target: Promise<T>, prop: string | symbol): any {
            // Promise methods: delegate to the real promise
            if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                return (target as any)[prop].bind(target);
            }

            // Symbol properties (like Symbol.toStringTag)
            if (typeof prop === 'symbol') {
                return (target as any)[prop];
            }

            // Property access: return nested thenable proxy
            return createThenableProxy(`${path}.${prop}`, promiseManager);
        },
    });

    return proxy as IThenableProxy<T>;
}

/**
 * Manages promises for all context paths.
 * Provides lazy creation and caching of promises.
 */
class PromiseManager {
    private promises = new Map<string, IPromiseEntry>();
    private realContext: Record<string, unknown>;

    constructor(realContext: Record<string, unknown>) {
        this.realContext = realContext;
    }

    /**
     * Gets an existing promise or creates a new one for the given path
     */
    getOrCreate<T = unknown>(path: string): IPromiseEntry<T> {
        if (this.promises.has(path)) {
            return this.promises.get(path) as IPromiseEntry<T>;
        }

        let resolve: (value: T) => void;
        let reject: (error: Error) => void;

        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        const entry: IPromiseEntry<T> = {
            promise,
            resolve: resolve!,
            reject: reject!,
        };

        this.promises.set(path, entry);

        // Check if this is a top-level step that has already completed
        const parts = path.split('.');
        const stepName = parts[0];
        if (parts.length === 1 && stepName in this.realContext) {
            // Step already completed, resolve immediately
            entry.resolve(this.realContext[stepName] as T);
        } else if (parts.length > 1 && stepName in this.realContext) {
            // Nested property of a completed step
            const value = this._getNestedValue(
                this.realContext[stepName],
                parts.slice(1).join('.'),
            );
            entry.resolve(value as T);
        } else {
            // Step hasn't completed yet, check if parent is already resolved
            this._autoResolveIfParentResolved(path, entry);
        }

        return entry;
    }

    /**
     * If parent path is already resolved, resolve this child path immediately
     */
    private _autoResolveIfParentResolved(path: string, entry: IPromiseEntry): void {
        const parts = path.split('.');
        if (parts.length <= 1) return; // No parent

        // Check each parent level from most specific to least
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            const parentEntry = this.promises.get(parentPath);

            if (parentEntry) {
                // Wait for parent to resolve, then resolve child
                parentEntry.promise
                    .then(parentValue => {
                        // Navigate to the child value
                        const childPath = parts.slice(i).join('.');
                        const childValue = this._getNestedValue(parentValue, childPath);

                        // Resolve the child promise
                        entry.resolve(childValue);
                    })
                    .catch(error => {
                        // Parent rejected, reject child too
                        entry.reject(error as Error);
                    });
                return;
            }
        }
    }

    /**
     * Gets nested value from an object by path
     */
    private _getNestedValue(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current && typeof current === 'object') {
                current = current[part];
            } else {
                return undefined;
            }
        }
        return current;
    }

    /**
     * Checks if a promise exists for the given path
     */
    has(path: string): boolean {
        return this.promises.has(path);
    }

    /**
     * Resolves all promises related to a step's output
     */
    resolveStep(stepName: string, output: unknown): void {
        // Resolve the main step promise
        if (this.promises.has(stepName)) {
            this.promises.get(stepName)!.resolve(output);
        }

        // Resolve nested property promises
        if (typeof output === 'object' && output !== null) {
            this._resolveNestedProperties(stepName, output);
        }
    }

    /**
     * Recursively resolves promises for nested properties
     */
    private _resolveNestedProperties(basePath: string, obj: any, depth = 0): void {
        // Limit recursion depth to avoid infinite loops
        if (depth > 10) return;

        for (const [key, value] of Object.entries(obj)) {
            const nestedPath = `${basePath}.${key}`;

            if (this.promises.has(nestedPath)) {
                this.promises.get(nestedPath)!.resolve(value);
            }

            // Recursively resolve deeper properties
            if (typeof value === 'object' && value !== null) {
                this._resolveNestedProperties(nestedPath, value, depth + 1);
            }
        }
    }

    /**
     * Rejects a promise for a given path
     */
    reject(path: string, error: Error): void {
        if (this.promises.has(path)) {
            this.promises.get(path)!.reject(error);
        }
    }
}

/**
 * Creates a context proxy that returns thenable proxies for all properties
 * except $meta, which is always available directly.
 *
 * Also tracks which properties are accessed for dependency detection.
 */
function createContextProxy(
    realContext: Record<string, unknown>,
    promiseManager: PromiseManager,
    currentStep: string,
    dependencyTracker: DependencyTracker,
): ITestContext {
    return new Proxy(realContext as ITestContext, {
        get(target: any, prop: string | symbol): any {
            // Special case: $meta is always available directly
            if (prop === '$meta') {
                return target.$meta;
            }

            // Track dependency if we're inside a step execution
            if (currentStep && typeof prop === 'string') {
                dependencyTracker.trackAccess(currentStep, prop);
            }

            // Return thenable proxy for step outputs
            if (typeof prop === 'string') {
                return createThenableProxy(prop, promiseManager);
            }

            return target[prop];
        },
    });
}

/**
 * Tracks dependency relationships between steps
 */
class DependencyTracker {
    private dependencies = new Map<string, Set<string>>();

    /**
     * Records that a step accessed a property
     */
    trackAccess(fromStep: string, property: string): void {
        if (!this.dependencies.has(fromStep)) {
            this.dependencies.set(fromStep, new Set());
        }
        this.dependencies.get(fromStep)!.add(property);
    }

    /**
     * Gets all dependencies for a step
     */
    getDependencies(stepName: string): string[] {
        return Array.from(this.dependencies.get(stepName) || []);
    }

    /**
     * Gets all dependency edges as graph edges
     */
    getEdges(): IDependencyEdge[] {
        const edges: IDependencyEdge[] = [];

        for (const [from, properties] of this.dependencies.entries()) {
            for (const property of properties) {
                // Extract the base step name from the property path
                const to = property.split('.')[0];
                edges.push({from, to, property});
            }
        }

        return edges;
    }
}

/**
 * Captures source location information for error reporting
 */
function captureSourceLocation(fn: Function): ISourceLocation {
    try {
        const stack = new Error().stack || '';
        const lines = stack.split('\n');

        // Find the first line that's not from this file
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes('executor.ts') && !line.includes('executor.js')) {
                // Try to parse: "at functionName (file:line:column)"
                const match = line.match(/\((.+):(\d+):(\d+)\)/);
                if (match) {
                    return {
                        file: match[1],
                        line: parseInt(match[2], 10),
                        column: parseInt(match[3], 10),
                    };
                }

                // Try alternative format: "at file:line:column"
                const altMatch = line.match(/at (.+):(\d+):(\d+)/);
                if (altMatch) {
                    return {
                        file: altMatch[1],
                        line: parseInt(altMatch[2], 10),
                        column: parseInt(altMatch[3], 10),
                    };
                }
            }
        }
    } catch (error) {
        // If parsing fails, return unknown location
    }

    return {
        file: 'unknown',
        line: 0,
        column: 0,
    };
}

/**
 * Main test executor class
 */
export class TestExecutor extends EventEmitter {
    private config: Required<ITestExecutorConfig>;
    private queue: PQueue;
    private dependencyTracker = new DependencyTracker();

    // Progress tracking
    private progress: ITestProgress = {
        testName: 'test',
        startTime: 0,
        status: 'pending',
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        steps: new Map(),
        groups: [],
    };

    // Dependency graph
    private graph: IDependencyGraph = {
        nodes: new Map(),
        edges: [],
    };

    // Latency tracking
    private latencyMetrics = new Map<string, IStepLatency>();

    // Real context (actual values)
    private realContext: Record<string, unknown> = {};

    // Promise manager (needs realContext, initialized in constructor)
    private promiseManager: PromiseManager;

    // Test framework context for nested test output
    private testContext?: import('./test-types.js').ITestFrameworkContext;

    constructor(config: ITestExecutorConfig = {}) {
        super();

        this.config = {
            concurrency: config.concurrency ?? 10,
            captureStackTraces: config.captureStackTraces ?? false,
            framework: config.framework,
        };

        this.queue = new PQueue({concurrency: this.config.concurrency});

        // Initialize promise manager with reference to realContext
        this.promiseManager = new PromiseManager(this.realContext);
    }

    /**
     * Executes an array of test steps
     */
    async execute(
        steps: StepArray,
        $meta: IMeta,
        testContext?: import('./test-types.js').ITestFrameworkContext,
    ): Promise<void> {
        // Store test context for nested execution
        this.testContext = testContext;

        // Clear and initialize context with $meta (preserve reference for PromiseManager)
        Object.keys(this.realContext).forEach(key => delete this.realContext[key]);
        this.realContext.$meta = $meta;

        // Initialize progress
        this.progress.testName = steps.name || 'test';
        this.progress.startTime = Date.now();
        this.progress.status = 'running';

        // Count total steps
        this.progress.totalSteps = this._countSteps(steps);

        // Emit test start event
        this.emit('test:start', this.progress);

        try {
            // Execute all steps
            await this._executeSteps(steps, [], this.testContext as any);

            // Mark as completed
            this.progress.status = 'completed';
            this.progress.endTime = Date.now();

            // Build final dependency graph
            this.graph.edges = this.dependencyTracker.getEdges();
        } catch (error) {
            this.progress.status = 'failed';
            this.progress.endTime = Date.now();
            throw error;
        } finally {
            this.emit('test:end', this.progress);
        }
    }

    /**
     * Recursively executes steps, handling both functions and nested arrays
     */
    private async _executeSteps(
        steps: StepArray,
        groupPath: string[],
        parentTestContext?: unknown,
    ): Promise<void> {
        const stepPromises: Promise<void>[] = [];

        for (const step of steps) {
            if (Array.isArray(step)) {
                // Nested array - wait for current level to complete first
                await Promise.all(stepPromises);
                stepPromises.length = 0;

                const nestedGroupPath = [...groupPath, step.name || `group-${groupPath.length}`];

                // If we have a test context, use it to create nested test scope
                if (this.testContext && parentTestContext) {
                    const nestedName = step.name || `group-${groupPath.length}`;
                    await (this.testContext.test as any).call(
                        parentTestContext,
                        nestedName,
                        async (nestedContext: unknown) => {
                            await this._executeSteps(step, nestedGroupPath, nestedContext);
                        },
                    );
                } else if (this.testContext && groupPath.length === 0) {
                    // Top-level nested array
                    const nestedName = step.name || `group-${groupPath.length}`;
                    await this.testContext.test(nestedName, async (nestedContext: unknown) => {
                        await this._executeSteps(step, nestedGroupPath, nestedContext);
                    });
                } else {
                    // No test context, execute directly
                    await this._executeSteps(step, nestedGroupPath, parentTestContext);
                }
            } else if (typeof step === 'function') {
                // Execute function step in parallel
                const promise = this._executeStep(step, groupPath, parentTestContext);
                stepPromises.push(promise);
            }
        }

        // Wait for remaining steps at this level
        await Promise.all(stepPromises);
    }

    /**
     * Executes a single step function
     */
    private async _executeStep(
        fn: StepFunction,
        groupPath: string[],
        parentTestContext?: unknown,
    ): Promise<void> {
        const stepName = fn.name || 'anonymous';

        // Capture source location if enabled
        const sourceLocation = this.config.captureStackTraces
            ? captureSourceLocation(fn)
            : undefined;

        // Initialize step progress
        const stepProgress: IStepProgress = {
            stepName,
            displayName: stepName,
            groupPath,
            status: 'pending',
            dependencies: [],
            dependents: [],
            sourceLocation,
        };

        this.progress.steps.set(stepName, stepProgress);

        // Initialize dependency graph node
        this.graph.nodes.set(stepName, {
            stepName,
            groupPath,
            status: 'pending',
        });

        // Initialize latency tracking
        const latency: IStepLatency = {
            stepName,
            queuedAt: Date.now(),
            queueTime: 0,
            waitTime: 0,
            executionTime: 0,
            totalTime: 0,
        };
        this.latencyMetrics.set(stepName, latency);

        // Wrap execution function for potential test context wrapping
        const executeStepFn = async () => {
            latency.startedAt = Date.now();
            latency.queueTime = latency.startedAt - latency.queuedAt;

            stepProgress.status = 'running';
            stepProgress.startTime = latency.startedAt;
            this.graph.nodes.get(stepName)!.status = 'running';
            this.graph.nodes.get(stepName)!.startTime = latency.startedAt;

            this.emit('step:start', stepName, stepProgress);

            try {
                // Create tracking context
                const context = createContextProxy(
                    this.realContext,
                    this.promiseManager,
                    stepName,
                    this.dependencyTracker,
                );

                // Execute the step
                const result = await fn(assert, context);

                // Store result in real context
                this.realContext[stepName] = result;

                // Resolve all promises for this step
                this.promiseManager.resolveStep(stepName, result);

                // Update progress - calculate latency metrics
                latency.completedAt = Date.now();
                latency.totalTime = latency.completedAt - latency.queuedAt;
                latency.executionTime = latency.completedAt - latency.startedAt;
                latency.queueTime = latency.startedAt - latency.queuedAt;
                latency.waitTime = 0; // TODO: More sophisticated wait time tracking

                stepProgress.status = 'completed';
                stepProgress.endTime = latency.completedAt;
                stepProgress.duration = latency.totalTime;
                stepProgress.queueTime = latency.queueTime;
                stepProgress.executionTime = latency.executionTime;
                stepProgress.waitTime = latency.waitTime;
                stepProgress.result = result;
                stepProgress.dependencies = this.dependencyTracker.getDependencies(stepName);

                this.graph.nodes.get(stepName)!.status = 'completed';
                this.graph.nodes.get(stepName)!.endTime = latency.completedAt;

                this.progress.completedSteps++;
                this.emit('step:end', stepName, stepProgress);
            } catch (error) {
                // Handle error
                latency.completedAt = Date.now();
                latency.totalTime = latency.completedAt - latency.queuedAt;
                latency.executionTime = latency.completedAt - latency.startedAt;
                latency.queueTime = latency.startedAt - latency.queuedAt;
                latency.waitTime = 0;

                stepProgress.status = 'failed';
                stepProgress.endTime = latency.completedAt;
                stepProgress.duration = latency.totalTime;
                stepProgress.dependencies = this.dependencyTracker.getDependencies(stepName);

                const stepError: IStepError = {
                    message: (error as Error).message,
                    stack: (error as Error).stack || '',
                    context: {...this.realContext},
                };
                stepProgress.error = stepError;

                this.graph.nodes.get(stepName)!.status = 'failed';
                this.graph.nodes.get(stepName)!.endTime = latency.completedAt;
                this.graph.nodes.get(stepName)!.error = error as Error;

                this.progress.failedSteps++;
                this.emit('step:error', stepName, error as Error, stepProgress);

                // Reject promises for this step
                this.promiseManager.reject(stepName, error as Error);

                throw error;
            }
        };

        // If we have test context, wrap in nested test
        if (this.testContext && parentTestContext) {
            await this.queue.add(async () => {
                try {
                    await (this.testContext!.test as any).call(
                        parentTestContext,
                        stepName,
                        async () => {
                            await executeStepFn();
                        },
                    );
                } catch (error) {
                    // Error already handled in executeStepFn, don't rethrow to break the queue
                    // The test framework will report it
                }
            });
        } else if (this.testContext && groupPath.length === 0) {
            // Top-level step with test context
            await this.queue.add(async () => {
                try {
                    await this.testContext!.test(stepName, async () => {
                        await executeStepFn();
                    });
                } catch (error) {
                    // Error already handled in executeStepFn, don't rethrow to break the queue
                }
            });
        } else {
            // No test context or not at top level
            await this.queue.add(executeStepFn);
        }
    }

    /**
     * Counts total number of steps (including nested)
     */
    private _countSteps(steps: StepArray): number {
        let count = 0;

        for (const step of steps) {
            if (Array.isArray(step)) {
                count += this._countSteps(step);
            } else if (typeof step === 'function') {
                count++;
            }
        }

        return count;
    }

    /**
     * Gets the current progress snapshot
     */
    getProgress(): ITestProgress {
        return this.progress;
    }

    /**
     * Gets the dependency graph
     */
    getDependencyGraph(): IDependencyGraph {
        return this.graph;
    }

    /**
     * Gets latency metrics
     */
    getLatencyReport(): ITestLatency {
        const totalDuration = this.progress.endTime
            ? this.progress.endTime - this.progress.startTime
            : 0;

        // Calculate critical path
        const criticalPath = this._calculateCriticalPath();

        // Calculate parallel efficiency
        const totalStepTime = Array.from(this.latencyMetrics.values()).reduce(
            (sum, l) => sum + l.executionTime,
            0,
        );
        const parallelEfficiency = totalDuration > 0 ? totalStepTime / totalDuration : 0;

        // Identify bottlenecks
        const bottlenecks = this._identifyBottlenecks();

        return {
            testName: this.progress.testName,
            totalDuration,
            steps: this.latencyMetrics,
            criticalPath,
            parallelEfficiency,
            bottlenecks,
        };
    }

    /**
     * Calculates the critical path (longest dependency chain)
     */
    private _calculateCriticalPath(): string[] {
        // Build adjacency list
        const adjacency = new Map<string, string[]>();
        for (const edge of this.graph.edges) {
            if (!adjacency.has(edge.to)) {
                adjacency.set(edge.to, []);
            }
            adjacency.get(edge.to)!.push(edge.from);
        }

        // Find longest path using DFS
        const visited = new Set<string>();
        let longestPath: string[] = [];

        const dfs = (node: string, path: string[]): void => {
            if (visited.has(node)) return;
            visited.add(node);

            const newPath = [...path, node];

            const children = adjacency.get(node) || [];
            if (children.length === 0) {
                // Leaf node - check if this is the longest path
                if (newPath.length > longestPath.length) {
                    longestPath = newPath;
                }
            } else {
                for (const child of children) {
                    dfs(child, newPath);
                }
            }

            visited.delete(node);
        };

        // Start DFS from all roots (nodes with no dependencies)
        const allNodes = new Set(this.graph.nodes.keys());
        const dependentNodes = new Set(this.graph.edges.map(e => e.from));
        const roots = Array.from(allNodes).filter(n => !dependentNodes.has(n));

        for (const root of roots) {
            dfs(root, []);
        }

        return longestPath.reverse(); // Reverse to get correct order
    }

    /**
     * Identifies bottleneck steps that blocked many other steps
     */
    private _identifyBottlenecks(): Array<{
        stepName: string;
        executionTime: number;
        blockedSteps: string[];
    }> {
        const bottlenecks: Map<string, Set<string>> = new Map();

        // Count how many steps each step blocks
        for (const edge of this.graph.edges) {
            if (!bottlenecks.has(edge.to)) {
                bottlenecks.set(edge.to, new Set());
            }
            bottlenecks.get(edge.to)!.add(edge.from);
        }

        // Sort by number of blocked steps
        const result = Array.from(bottlenecks.entries())
            .map(([stepName, blockedSteps]) => ({
                stepName,
                executionTime: this.latencyMetrics.get(stepName)?.executionTime || 0,
                blockedSteps: Array.from(blockedSteps),
            }))
            .sort((a, b) => b.blockedSteps.length - a.blockedSteps.length)
            .slice(0, 5); // Top 5 bottlenecks

        return result;
    }

    /**
     * Type-safe event emitter
     */
    on<E extends keyof ITestEvents>(event: E, handler: ITestEvents[E]): this {
        return super.on(event, handler as any);
    }

    emit<E extends keyof ITestEvents>(event: E, ...args: Parameters<ITestEvents[E]>): boolean {
        return super.emit(event, ...args);
    }
}

// Export all types
export type * from './test-types.js';
