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

import type nodeAssert from 'node:assert';
import PQueue from 'p-queue';
import {Emitter} from './emitter.ts';
import {progressTree, reportProgress} from './progress.ts';
import {mapSourcePosition} from './sourceMap.ts';
import type {
    IAssertion,
    IDependencyEdge,
    IDependencyGraph,
    IMeta,
    IProgressEntry,
    IPromiseEntry,
    ISourceLocation,
    IStepError,
    IStepLatency,
    IStepProgress,
    ITestContext,
    ITestEvents,
    ITestExecutorConfig,
    ITestFrameworkContext,
    ITestLatency,
    ITestLogger,
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
    const proxy = new Proxy(promiseEntry.promise, {
        get(target: Promise<T> & Record<symbol, unknown>, prop: string | symbol) {
            // Promise methods: delegate to the real promise
            if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                return target[prop].bind(target);
            }

            // Symbol properties (like Symbol.toStringTag)
            if (typeof prop === 'symbol') {
                return target[prop];
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

        this.promises.set(path, entry as IPromiseEntry<unknown>);

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
            this._autoResolveIfParentResolved(path, entry as IPromiseEntry<unknown>);
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
    private _getNestedValue(obj: unknown, path: string): unknown {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current && typeof current === 'object') {
                current = (current as Record<string, unknown>)[part];
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
    private _resolveNestedProperties(basePath: string, obj: unknown, depth = 0): void {
        // Limit recursion depth to avoid infinite loops
        if (depth > 10) return;

        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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
        // A dependent step may not have started yet, so no promise entry exists to
        // reject. Create it, or the step starts later, calls `getOrCreate`, and waits
        // on a fresh promise nobody will ever settle @@D-584.
        if (!this.promises.has(path)) {
            const entry = this.getOrCreate(path);
            entry.reject(error);
            // This promise was created here, so its only handler is a dependent that
            // may never start. Attaching a no-op catch keeps an unobserved rejection
            // from failing the process; a dependent that does start still awaits this
            // same entry and receives the error.
            entry.promise.catch(() => {});
            return;
        }
        this.promises.get(path)!.reject(error);
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
        get(target: ITestContext & Record<symbol, unknown>, prop: string | symbol) {
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
    private validStepNames = new Set<string>();
    private seenEdges = new Set<string>();
    private onEdge?: (edge: IDependencyEdge) => void;

    setOnEdge(callback: (edge: IDependencyEdge) => void): void {
        this.onEdge = callback;
    }

    reset(): void {
        this.dependencies.clear();
        this.seenEdges.clear();
    }

    /**
     * Sets the valid step names that can be referenced
     */
    setValidStepNames(stepNames: Set<string>): void {
        this.validStepNames = stepNames;
    }

    /**
     * Records that a step accessed a property
     */
    trackAccess(fromStep: string, property: string): void {
        if (!this.dependencies.has(fromStep)) {
            this.dependencies.set(fromStep, new Set());
        }
        this.dependencies.get(fromStep)!.add(property);

        // Validate immediately if we have valid step names
        if (this.validStepNames.size > 0) {
            const stepName = property.split('.')[0];
            if (!this.validStepNames.has(stepName)) {
                throw new Error(
                    `Invalid step reference(s) detected: Step "${fromStep}" references "context.${property}", ` +
                        `but no step named "${stepName}" exists. ` +
                        `Available steps: ${Array.from(this.validStepNames).sort().join(', ')}`,
                );
            }
            const edge: IDependencyEdge = {from: fromStep, to: stepName, property};
            const key = `${edge.from}\u0000${edge.to}\u0000${edge.property}`;
            if (!this.seenEdges.has(key)) {
                this.seenEdges.add(key);
                this.onEdge?.(edge);
            }
        }
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
 * A stack position, mapped back through a registered browser source map when there is one @@D-583.
 *
 * The stack file is kept as captured: it is what the source-link resolver turns into a workspace
 * path. Only the generated line and column are replaced.
 */
function resolved(file: string, line: string, column: string): ISourceLocation {
    const mapped = mapSourcePosition(file, parseInt(line, 10), parseInt(column, 10));
    return {file, line: mapped.line, column: mapped.column};
}

/**
 * Captures source location information for error reporting
 */
function captureSourceLocation(): ISourceLocation {
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
                    return resolved(match[1], match[2], match[3]);
                }

                // Try alternative format: "at file:line:column"
                const altMatch = line.match(/at (.+):(\d+):(\d+)/);
                if (altMatch) {
                    return resolved(altMatch[1], altMatch[2], altMatch[3]);
                }
            }
        }
    } catch {
        // If parsing fails, return unknown location
    }

    return {
        file: 'unknown',
        line: 0,
        column: 0,
    };
}

/** The message a step gave an assertion, or a label naming the method. */
function assertionMessage(method: string, args: unknown[]): string {
    const last = args[args.length - 1];
    return typeof last === 'string' ? last : `assert.${method}`;
}

/**
 * Wrap an assert object so every call becomes one `IAssertion`.
 *
 * Snapshot helpers are delegated untouched: they are not assertions. A method that returns a
 * promise is recorded when it settles, so `assert.rejects` counts its own outcome rather than the
 * call. The source pointer is captured before the call, which is what makes it point at the step
 * rather than at the wrapper.
 */
function createCountingAssert(
    base: typeof nodeAssert,
    record: (assertion: IAssertion) => void,
): typeof nodeAssert {
    const notAssertions = new Set([
        'snapshot',
        'matchSnapshot',
        'AssertionError',
        'register',
        'strict',
    ]);
    const call = (name: string, fn: (...args: never[]) => unknown, args: unknown[]): unknown => {
        const source = captureSourceLocation();
        const message = assertionMessage(name, args);
        const passed = (): void => record({message, passed: true, timestamp: Date.now(), source});
        const failed = (error: unknown): never => {
            record({
                message: (error as Error)?.message || message,
                passed: false,
                timestamp: Date.now(),
                source,
            });
            throw error;
        };
        try {
            const result = fn(...(args as never[]));
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                return (result as Promise<unknown>).then(
                    value => {
                        passed();
                        return value;
                    },
                    error => failed(error),
                );
            }
            passed();
            return result;
        } catch (error) {
            return failed(error);
        }
    };
    return new Proxy(base, {
        apply(target, thisArg, args) {
            return call('assert', target as unknown as (...args: never[]) => unknown, args);
        },
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (
                typeof prop !== 'string' ||
                notAssertions.has(prop) ||
                typeof value !== 'function'
            ) {
                return value;
            }
            return (...args: unknown[]) => call(prop, value as (...args: never[]) => unknown, args);
        },
    }) as typeof nodeAssert;
}

/** Default number of retry attempts per failing step when `rerun.enabled` is true */
const DEFAULT_MAX_RETRIES = 1;

// ============================================================================
// Masking helpers (also used by assert.snapshot and snapshot markers)
// ============================================================================

/**
 * Deep-clone `value` and replace the leaf at each dot-path in `paths` with
 * `'<masked>'`. Supports `'*'` as a wildcard in any path segment, meaning
 * "apply to every direct child of the current object".
 *
 * Examples:
 *   maskPaths({id: '1', name: 'A'}, ['id'])
 *     → {id: '<masked>', name: 'A'}
 *   maskPaths({a: {id: '1'}, b: {id: '2'}}, ['*.id'])
 *     → {a: {id: '<masked>'}, b: {id: '<masked>'}}
 */
function maskPaths(value: unknown, paths: string[]): unknown {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    for (const path of paths) setAtPath(clone, path.split('.'));
    return clone;
}

function setAtPath(obj: unknown, parts: string[]): void {
    if (typeof obj !== 'object' || obj === null || parts.length === 0) return;
    const [head, ...tail] = parts;
    if (head === '__proto__' || head === 'constructor' || head === 'prototype') return;
    const record = obj as Record<string, unknown>;
    if (tail.length === 0) {
        if (Object.prototype.hasOwnProperty.call(record, head)) record[head] = '<masked>';
    } else if (head === '*') {
        for (const key of Object.keys(record)) setAtPath(record[key], tail);
    } else {
        setAtPath(record[head], tail);
    }
}

/**
 * Main test executor class
 */
export class TestExecutor extends Emitter<ITestEvents> {
    private config: ITestExecutorConfig;
    private assert: typeof nodeAssert;
    private queue: PQueue;
    private dependencyTracker = new DependencyTracker();
    private log?: ITestLogger;

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
        assertions: {total: 0, threw: 0},
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
    private testContext?: ITestFrameworkContext;

    // Track step names to detect duplicates
    private stepNamesUsed = new Set<string>();

    constructor(config: ITestExecutorConfig = {}) {
        super();

        if (!config.assert) {
            throw new Error(
                'TestExecutor requires an assert implementation; import the server entry or pass config.assert',
            );
        }
        this.assert = config.assert;

        this.config = {
            concurrency: config.concurrency ?? 10,
            captureStackTraces: config.captureStackTraces ?? false,
            framework: config.framework,
            log: config.log,
            rerun: config.rerun,
            mask: config.mask,
            maskFn: config.maskFn,
            autoSnapshot: config.autoSnapshot,
            assert: config.assert,
        };
        this.log = config.log;

        this.queue = new PQueue({concurrency: this.config.concurrency});
        this.dependencyTracker.setOnEdge(edge => this.emit('step:dependency', edge));

        // Initialize promise manager with reference to realContext
        this.promiseManager = new PromiseManager(this.realContext);
    }

    /**
     * Executes an array of test steps
     */
    async execute(
        steps: StepArray,
        $meta: IMeta,
        testContext?: ITestFrameworkContext,
    ): Promise<void> {
        // Store test context for nested execution
        this.testContext = testContext;

        // Clear and initialize context with $meta (preserve reference for PromiseManager)
        Object.keys(this.realContext).forEach(key => delete this.realContext[key]);
        this.realContext.$meta = $meta;

        // Clear step name tracking for new test run
        this.stepNamesUsed.clear();

        // Initialize progress
        this.progress.testName = steps.name || 'test';
        this.progress.startTime = Date.now();
        this.progress.status = 'running';
        this.progress.completedSteps = 0;
        this.progress.failedSteps = 0;
        this.progress.assertions = {total: 0, threw: 0};
        this.progress.steps.clear();
        this.progress.groups = [];

        // Reset dependency graph
        this.graph.nodes.clear();
        this.graph.edges = [];

        // Reset latency metrics
        this.latencyMetrics.clear();

        // Count total steps and collect step names
        this.progress.totalSteps = this._countSteps(steps);
        const allStepNames = this._collectStepNames(steps);

        // Set valid step names for dependency validation
        this.dependencyTracker.setValidStepNames(allStepNames);
        this.dependencyTracker.reset();

        // Emit test start event
        this.emit('test:start', this.progress);

        try {
            // Execute all steps
            await this._executeSteps(steps, [], this.testContext);

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
        parentTestContext?: ITestFrameworkContext,
    ): Promise<void> {
        const stepPromises: Promise<void>[] = [];
        const namedPromises = new Map<string, Promise<void>>();
        let snapshotIndex = 0;

        for (const step of steps) {
            if (Array.isArray(step)) {
                // Distinguish by element type:
                //   [] empty array        → sync barrier (existing behaviour)
                //   ['*'] / ['s1','s2']  → snapshot marker
                //   [fn, ...] nested     → nested step group (existing behaviour)
                if (step.length === 0) {
                    // Sync barrier — wait for all parallel steps in this batch
                    await Promise.all(stepPromises);
                    stepPromises.length = 0;
                    continue;
                }

                if (step.every(s => typeof s === 'string')) {
                    // Snapshot marker: await the relevant steps, then snapshot
                    const marker = step as unknown as string[];

                    if (marker.length === 1 && marker[0] === '*') {
                        // ['*'] — wait for entire current batch
                        await Promise.all(stepPromises);
                        stepPromises.length = 0;
                    } else {
                        // ['step1','step2'] — wait only for the named steps
                        const namedToWait = marker
                            .map(name => namedPromises.get(name))
                            .filter((p): p is Promise<void> => p !== undefined);
                        await Promise.all(namedToWait);
                        // stepPromises is NOT cleared — other steps keep running
                    }
                    const cpName =
                        (marker as {name?: string}).name ??
                        (marker.length === 1 && marker[0] === '*' ? `context` : marker.join('-'));
                    // Disambiguate when the same name is used more than once
                    const snapshotName =
                        snapshotIndex === 0 ? cpName : `${cpName}-${snapshotIndex}`;
                    snapshotIndex++;

                    const stepsToSnapshot =
                        marker.length === 1 && marker[0] === '*'
                            ? [...this.progress.steps.entries()]
                                  .filter(([, s]) => s.status === 'completed')
                                  .map(([name]) => name)
                            : marker.filter(name =>
                                  Object.prototype.hasOwnProperty.call(this.realContext, name),
                              );

                    const contextSnapshot = Object.fromEntries(
                        stepsToSnapshot.map(name => [
                            name,
                            this._applyMask(this.realContext[name]),
                        ]),
                    );

                    const snapshotTarget = parentTestContext;
                    if (snapshotTarget && typeof snapshotTarget.matchSnapshot === 'function') {
                        snapshotTarget.matchSnapshot(contextSnapshot, snapshotName);
                    }
                    continue;
                }

                // Nested step group — wait for current batch first
                await Promise.all(stepPromises);
                stepPromises.length = 0;

                const nestedGroupPath = [...groupPath, step.name || `group-${groupPath.length}`];

                // If we have a test context, use it to create nested test scope.
                // The scope being nested *into* owns the `test` method: calling the
                // root context's method with the child as `this` reaches for a private
                // field that object's class does not declare, and tap throws (the
                // failure the old code swallowed).
                if (this.testContext && parentTestContext) {
                    const nestedName = step.name || `group-${groupPath.length}`;
                    await parentTestContext.test(nestedName, async (nestedContext: unknown) => {
                        await this._executeSteps(
                            step,
                            nestedGroupPath,
                            nestedContext as ITestFrameworkContext,
                        );
                    });
                } else if (this.testContext && groupPath.length === 0) {
                    // Top-level nested array
                    const nestedName = step.name || `group-${groupPath.length}`;
                    await this.testContext.test(nestedName, async (nestedContext: unknown) => {
                        await this._executeSteps(
                            step,
                            nestedGroupPath,
                            nestedContext as ITestFrameworkContext,
                        );
                    });
                } else {
                    // No test context, execute directly
                    await this._executeSteps(step, nestedGroupPath, parentTestContext);
                }
            } else if (typeof step === 'function') {
                // Execute function step in parallel
                const promise = this._executeStep(step, groupPath, parentTestContext);
                const stepName = step.name || 'anonymous';
                stepPromises.push(promise);
                namedPromises.set(stepName, promise);
            }
        }

        // Wait for every step at this level before deciding the verdict. `Promise.all` rejects on
        // the first failure and lets the caller mark the run ended while independent steps are
        // still in flight; a browser console would then show them running forever. Waiting for all
        // of them and rethrowing the first failure keeps the run's verdict and its final state
        // consistent.
        const settled = await Promise.allSettled(stepPromises);
        const rejected = settled.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (rejected) throw rejected.reason;
    }

    /**
     * The invocation's progress list as it stands, for a read at a step boundary (PRD R26/R27).
     *
     * The `$meta` object is the one every step of this run shares — the same object the steps
     * destructure, and the one the handlers they call are handed.
     */
    private _progressList(): IProgressEntry[] | undefined {
        const progress = (this.realContext.$meta as IMeta | undefined)?.progress;
        return Array.isArray(progress) ? progress : undefined;
    }

    /**
     * What was announced since `seen`, or `undefined` when nothing was (PRD R26/R27).
     *
     * Two shapes, and both are ordinary. A list that still holds what it held is *appended* to,
     * and the difference between the two boundary reads is the step's own progress. A list that
     * no longer begins with those entries was **replaced**: a step that resets it to scope its
     * own assertions (`$meta.progress = []`, which is how a scenario keeps one step's
     * checkpoints out of the next one's) then owns everything in the new list, including when it
     * happens to end up as long as it started.
     *
     * Best-effort attribution, and deliberately so: steps that run in parallel share the one
     * list, so a point announced while two of them were running is reported by whichever
     * boundary read it. It is never lost, and a scenario whose steps are ordered by their
     * dependencies — which is what a test that asserts on progress is — has one at a time.
     */
    private _announcedSince(seen: IProgressEntry[] | undefined): IProgressEntry[] | undefined {
        const progress = this._progressList();
        if (progress === undefined || progress.length === 0) {
            return undefined;
        }
        if (!keeps(progress, seen)) {
            return progress;
        }
        return progress.length > seen.length ? progress.slice(seen.length) : undefined;
    }

    /**
     * Executes a single step function
     */
    private async _executeStep(
        fn: StepFunction,
        groupPath: string[],
        parentTestContext?: ITestFrameworkContext,
    ): Promise<void> {
        const stepName = fn.name || 'anonymous';

        // Check for duplicate step names
        this._checkForDuplicateStepName(stepName);

        // Capture source location if enabled
        const sourceLocation = this.config.captureStackTraces ? captureSourceLocation() : undefined;

        // Initialize step progress
        const stepProgress: IStepProgress = {
            stepName,
            displayName: stepName,
            groupPath,
            status: 'pending',
            dependencies: [],
            dependents: [],
            sourceLocation,
            assertions: {total: 0, threw: 0},
            assertionLog: [],
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
        // When a TAP sub-test context is supplied, assert is augmented with:
        //   assert.snapshot(value, 'name', opts?)   — explicit snapshot
        //   assert.snapshot()                        — deferred, no extra mask
        // Deferred snapshots are taken after fn() returns, under the step name.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const executeStepFn = async (stepTestContext?: ITestFrameworkContext) => {
            const hasSnapshotTarget =
                stepTestContext !== undefined &&
                typeof stepTestContext.matchSnapshot === 'function';

            // Tracks a deferred assert.snapshot() call made inside the step.
            const snapshotRequest: {deferred?: {mask?: string[]}} = {};

            const recordAssertion = (assertion: IAssertion): void => {
                stepProgress.assertionLog!.push(assertion);
                stepProgress.assertions!.total += 1;
                if (!assertion.passed) stepProgress.assertions!.threw += 1;
                this.progress.assertions.total += 1;
                if (!assertion.passed) this.progress.assertions.threw += 1;
            };

            const snapshotAssert = hasSnapshotTarget
                ? new Proxy(this.assert, {
                      get(target, prop) {
                          if (prop === 'matchSnapshot') {
                              // Bound to the test context it came from: tap's matcher reads its own
                              // state, so handing it out as a bare reference makes the caller invoke
                              // it with the assert object as `this`, and it fails reading a private
                              // field rather than reporting anything about the snapshot (T-205).
                              return stepTestContext?.matchSnapshot
                                  ? stepTestContext.matchSnapshot.bind(stepTestContext)
                                  : undefined;
                          }
                          if (prop === 'snapshot')
                              return (
                                  valueOrOpts?: unknown,
                                  nameOrNothing?: unknown,
                                  opts?: {mask?: string[]},
                              ) => {
                                  if (typeof nameOrNothing === 'string') {
                                      // Explicit: assert.snapshot(value, 'name', opts?)
                                      if (!valueOrOpts)
                                          throw new self.assert.AssertionError({
                                              message: `snapshot "${nameOrNothing}": value is falsy`,
                                          });
                                      const masked = self._applyMask(valueOrOpts, opts?.mask);
                                      stepTestContext.matchSnapshot!(
                                          masked,
                                          nameOrNothing as string,
                                      );
                                  } else {
                                      // Deferred: assert.snapshot() or assert.snapshot({mask})
                                      const deferOpts =
                                          typeof valueOrOpts === 'object' &&
                                          valueOrOpts !== null &&
                                          !Array.isArray(valueOrOpts)
                                              ? (valueOrOpts as {mask?: string[]})
                                              : {};
                                      snapshotRequest.deferred = {mask: deferOpts.mask};
                                  }
                              };
                          return (target as unknown as Record<string, unknown>)[prop as string];
                      },
                  })
                : this.assert;

            const stepAssert = createCountingAssert(snapshotAssert, recordAssertion);

            latency.startedAt = Date.now();
            latency.queueTime = latency.startedAt - latency.queuedAt;

            stepProgress.status = 'running';
            stepProgress.startTime = latency.startedAt;
            this.graph.nodes.get(stepName)!.status = 'running';
            this.graph.nodes.get(stepName)!.startTime = latency.startedAt;

            const progressBefore = this._progressList();
            this.emit('step:start', stepName, stepProgress);

            try {
                // Create tracking context
                const context = createContextProxy(
                    this.realContext,
                    this.promiseManager,
                    stepName,
                    this.dependencyTracker,
                );

                // Execute the step (with optional retry loop)
                const maxRetries = this.config.rerun?.enabled
                    ? (this.config.rerun.maxRetries ?? DEFAULT_MAX_RETRIES)
                    : 0;
                let result: unknown;
                let lastError: Error | undefined;

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    // Reset per-attempt deferred snapshot flag
                    delete snapshotRequest.deferred;
                    try {
                        result = await fn(stepAssert, context);
                        lastError = undefined;
                        break;
                    } catch (err) {
                        lastError = err as Error;
                        if (attempt < maxRetries) {
                            this.log?.warn?.(
                                {err},
                                `step ${stepName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying`,
                            );
                        }
                    }
                }

                if (lastError !== undefined) {
                    throw lastError;
                }

                // Handle deferred assert.snapshot() — called inside step with no explicit value
                if (snapshotRequest.deferred !== undefined && hasSnapshotTarget) {
                    if (!result)
                        throw new self.assert.AssertionError({
                            message: `snapshot "${stepName}": step returned a falsy value`,
                        });
                    const masked = self._applyMask(result, snapshotRequest.deferred.mask);
                    stepTestContext.matchSnapshot!(masked, stepName);
                } else if (self.config.autoSnapshot && hasSnapshotTarget) {
                    // Auto-snapshot: capture result automatically, no assert.snapshot() needed
                    if (!result)
                        throw new self.assert.AssertionError({
                            message: `snapshot "${stepName}": step returned a falsy value`,
                        });
                    const masked = self._applyMask(result);
                    stepTestContext.matchSnapshot!(masked, stepName);
                }

                // Store result in real context
                this.realContext[stepName] = result;

                // What this step announced, read at the boundary before the event so a
                // listener that writes the step's result file sees it (see `step:end`).
                const announced = this._announcedSince(progressBefore);
                if (announced !== undefined) stepProgress.progress = announced;

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

                // A point becomes a sub-test of the step that announced it, and a branch the
                // sub-test holding the points taken inside it — a checkpoint as a *step* in
                // the report, which is what "checkpoints drive test reporting" claims
                // (PRD R26/R27). Rendered from the same entries `blong-allure` maps into
                // Allure steps, so the two reports cannot describe different shapes.
                //
                // The context is checked the way the snapshot handling checks it, because
                // the queue hands the task its own options where there is no test context:
                // only a context that can nest a test gets progress nested in it.
                if (
                    typeof stepTestContext?.test === 'function' &&
                    stepProgress.progress !== undefined
                ) {
                    for (const node of progressTree(stepProgress.progress)) {
                        await reportProgress(stepTestContext, node);
                    }
                }
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

                // Kept even though the step failed, and especially then: what a failing step
                // announced is the evidence a reader wants, and Allure renders it from here.
                // The tap side leaves it out — sub-tests are not added to a step that threw.
                const announcedOnFailure = this._announcedSince(progressBefore);
                if (announcedOnFailure !== undefined) stepProgress.progress = announcedOnFailure;

                this.progress.failedSteps++;
                this.emit('step:error', stepName, error as Error, stepProgress);
                this.log?.error?.({err: error}, `step ${stepName} failed`);

                // Reject promises for this step
                this.promiseManager.reject(stepName, error as Error);

                throw error;
            }
        };

        // If we have test context, wrap in nested test.  The enclosing scope owns the
        // `test` method — the step is a sub-test of *it*, not of the run's root
        // context — and the call is made through `runInScope`, so a failure to nest
        // one cannot make the step disappear.
        const scope = this.testContext
            ? (parentTestContext ?? (groupPath.length === 0 ? this.testContext : undefined))
            : undefined;
        if (scope) {
            await this.queue.add(() =>
                this.runInScope(scope, stepName, stepTestContext => executeStepFn(stepTestContext)),
            );
        } else {
            // No test context, or a nested step whose scope cannot nest one
            await this.queue.add(executeStepFn as () => Promise<void>);
        }
    }

    /**
     * Run a step as a sub-test of `scope`, falling back to a direct run when the
     * scope cannot nest one.
     *
     * The fallback is the point: `test()` can throw before the callback ever runs
     * — tap does exactly that when its `this` is not the test the method belongs
     * to — and swallowing that error silently dropped the step (a cucumber
     * scenario reported as a passing test that executed nothing).  A failure
     * *inside* the sub-test is still the framework's to report, so it is not
     * re-thrown here.
     */
    private async runInScope(
        scope: ITestFrameworkContext,
        name: string,
        run: (stepTestContext: ITestFrameworkContext | undefined) => Promise<void>,
    ): Promise<void> {
        let started = false;
        try {
            await scope.test(name, async (sub: unknown) => {
                started = true;
                await run(sub as ITestFrameworkContext);
            });
        } catch {
            // A failure inside the sub-test is reported by the framework itself.
        }
        if (!started) await run(undefined);
    }

    /**
     * Counts total number of steps (including nested)
     */
    private _countSteps(steps: StepArray): number {
        let count = 0;

        for (const step of steps) {
            if (Array.isArray(step)) {
                count += this._countSteps(step as StepArray);
            } else if (typeof step === 'function') {
                count++;
            }
        }

        return count;
    }

    /**
     * Collects all step names (including nested)
     */
    private _collectStepNames(steps: StepArray): Set<string> {
        const stepNames = new Set<string>();

        for (const step of steps) {
            if (Array.isArray(step)) {
                // Skip snapshot markers (string-only arrays) — they are not steps
                if (step.every(s => typeof s === 'string')) continue;
                // Recursively collect from nested step groups
                const nested = this._collectStepNames(step as StepArray);
                nested.forEach(name => stepNames.add(name));
            } else if (typeof step === 'function') {
                const stepName = step.name || 'anonymous';
                stepNames.add(stepName);
            }
        }

        return stepNames;
    }

    /**
     * Checks for duplicate step names and throws an error if found
     */
    private _checkForDuplicateStepName(stepName: string): void {
        if (this.stepNamesUsed.has(stepName)) {
            throw new Error(
                `Duplicate step name detected: "${stepName}". ` +
                    `Each step must have a unique function name within the same test context.`,
            );
        }
        this.stepNamesUsed.add(stepName);
    }

    /**
     * Applies the chain-level `mask` (and optional per-call `extraPaths`) to
     * `value`. Returns the original reference unchanged when no masking is
     * configured. Falls back to the deprecated `maskFn` when supplied.
     */
    private _applyMask(value: unknown, extraPaths?: string[]): unknown {
        const paths = [...(this.config.mask ?? []), ...(extraPaths ?? [])];
        if (!paths.length && !this.config.maskFn) return value;
        if (this.config.maskFn) return this.config.maskFn(value, paths);
        return maskPaths(value, paths);
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
        return super.on(event, handler);
    }

    emit<E extends keyof ITestEvents>(event: E, ...args: Parameters<ITestEvents[E]>): boolean {
        return super.emit(event, ...args);
    }
}

// Export all types
export {progressTree, reportProgress} from './progress.ts';
export type * from './test-types.js';

/**
 * Whether a progress list still holds what it held, entry for entry and by identity.
 *
 * Identity rather than equality, because the entries are objects the recorder pushed: a list
 * that kept them is one that was spread back with additions, and a list whose first entry is a
 * different object is one that was reset and announced afresh — which is the difference between
 * a step *adding* to the invocation's progress and *replacing* it.
 */
const keeps = (
    progress: IProgressEntry[],
    seen: IProgressEntry[] | undefined,
): seen is IProgressEntry[] =>
    progress === seen ||
    (seen !== undefined &&
        progress.length >= seen.length &&
        seen.every((entry, at) => progress[at] === entry));
