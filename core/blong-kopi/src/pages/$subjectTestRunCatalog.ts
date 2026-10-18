import type {ITestRunCatalogEntry} from '@feasibleone/blong-browser';

/**
 * The test scenarios the `$subject` Test runs page may start.
 *
 * The page is only linked from the `test-ui` menu, and this list is the guard: the
 * loader is never called with a method outside it. The browser entry runs in this
 * window; the server entry is executed by the `testRealm` runner in the suite.
 */
export const $subjectTestRunCatalog: ITestRunCatalogEntry[] = [
    {method: 'test.$object.flow', name: '$object flow browser'},
    {method: 'test.$object', name: '$object flow server', host: 'server'},
];
