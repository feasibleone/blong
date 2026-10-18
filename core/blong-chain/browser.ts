/**
 * TestExecutor — browser entry.
 *
 * No `node:*` module is imported for a value: the executor's assert implementation is injected, and
 * this entry supplies the browser-safe fallback. A host that owns a richer assert can pass it in
 * `ITestExecutorConfig.assert`.
 */
import {createBrowserAssert} from './browser-assert.ts';
import {TestExecutor as TestExecutorBase} from './executor.ts';
import type {ITestExecutorConfig} from './test-types.js';

export class TestExecutor extends TestExecutorBase {
    constructor(config: ITestExecutorConfig = {}) {
        super({...config, assert: config.assert ?? createBrowserAssert()});
    }
}

export {AssertionError, createBrowserAssert} from './browser-assert.ts';
export {progressTree, reportProgress} from './progress.ts';
export {TestRunRegistry} from './runRegistry.ts';
export type * from './test-types.js';
export type {
    IRunEvent,
    IRunEventPage,
    ITestRunRegistryOptions,
    TestRunState,
} from './runRegistry.ts';
