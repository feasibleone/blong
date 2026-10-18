/**
 * The catalog handler a host realm registers for the TestRun page.
 *
 * The handler only describes scenarios; it never dispatches one. A host binds it in a browser
 * layer whose activation is `test-ui`, supplies the catalog (or lets its component config supply
 * it), and the page then refuses any method outside that list.
 */
import {handler} from '@feasibleone/blong';
import type {ITestRunCatalogEntry} from './TestRunPage.js';

export interface ITestRunCatalogSettings {
    /** The scenarios the host allows; defaults to the list passed to the factory. */
    tests?: ITestRunCatalogEntry[];
    /** Set false in an environment where the page must exist but run nothing. */
    enabled?: boolean;
}

/**
 * Build a catalog handler definition a host layer can export. The host file is named `catalogGet.ts`
 * to match this function's name; place it in a handler group the host realm activates.
 */
export function createTestRunCatalogHandler(
    fallback: ITestRunCatalogEntry[] = [],
    method = 'test.run.catalogGet',
) {
    return handler(function catalogGet({config}) {
        const settings = (config ?? {}) as ITestRunCatalogSettings;
        return {
            [method]: async () => ({
                tests: settings.enabled === false ? [] : (settings.tests ?? fallback),
            }),
        };
    });
}
