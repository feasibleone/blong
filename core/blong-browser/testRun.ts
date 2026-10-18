/**
 * Server-safe TestRun model entry.
 *
 * A server-hosted runner needs the same projection the browser source uses, without importing the
 * React component tree. This entry exports only the model, its reducer and the pure projection.
 */
export {reduceTestRunEvent} from './src/components/TestRun/testRunModel.ts';
export {
    pendingBrowserRun,
    projectBrowserRun,
    type ITestRunProjectionOptions,
} from './src/components/TestRun/testRunProjection.ts';
export type {
    ITestAssertionCounts,
    ITestRunCounts,
    ITestRunEvent,
    ITestRunModel,
    ITestStepModel,
} from './src/types/testRun.ts';
