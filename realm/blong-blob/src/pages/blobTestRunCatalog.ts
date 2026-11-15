import type {ITestRunCatalogEntry} from '@feasibleone/blong-browser';

/**
 * The test scenarios the `blob` Test runs page may start.
 *
 * The page is only linked from the `test-ui` menu, and this list is the guard: the
 * loader is never called with a method outside it. The browser entry runs in this
 * window; the server entry is executed by the `testRealm` runner in the suite.
 *
 * Empty until Group 7 of `plans/blob/plan.md` adds the groups this realm runs.
 */
export const blobTestRunCatalog: ITestRunCatalogEntry[] = [];
