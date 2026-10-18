/**
 * TestExecutor — server entry.
 *
 * The implementation is isomorphic (`./executor.ts`); this entry supplies Node's assert, which is
 * what a server-hosted run and the existing chain wrapper expect. Browser code imports
 * `@feasibleone/blong-chain/browser.ts` instead.
 */
import nodeAssert from 'node:assert';
import {TestExecutor as TestExecutorBase} from './executor.ts';
import type {ITestExecutorConfig} from './test-types.js';

export class TestExecutor extends TestExecutorBase {
    constructor(config: ITestExecutorConfig = {}) {
        super({...config, assert: config.assert ?? nodeAssert});
    }
}

export {progressTree, reportProgress} from './progress.ts';
export {TestRunRegistry} from './runRegistry.ts';
export type * from './test-types.js';
export type {
    IRunEvent,
    IRunEventPage,
    ITestRunRegistryOptions,
    TestRunState,
} from './runRegistry.ts';
