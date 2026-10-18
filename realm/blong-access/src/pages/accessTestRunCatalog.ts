import type {ITestRunCatalogEntry} from '@feasibleone/blong-browser';

/**
 * The browser test scenarios the access Test runs page may start.
 *
 * The page is only linked from the `test-ui` menu, and this list is the guard: the loader is never
 * called with a method outside it.
 */
export const accessTestRunCatalog: ITestRunCatalogEntry[] = [
    {method: 'test.session.flow', name: 'session flow browser'},
    {method: 'test.authorization.flow', name: 'authorization flow browser'},
    {method: 'test.login.flow', name: 'login flow server', host: 'server'},
];
