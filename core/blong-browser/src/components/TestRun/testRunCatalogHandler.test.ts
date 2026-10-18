import {describe, expect, it} from 'vitest';
import {createTestRunCatalogHandler} from './testRunCatalogHandler.js';
import type {ITestRunCatalogEntry} from './TestRunPage.js';

type CatalogApi = (api: unknown) => Record<string, () => Promise<{tests: ITestRunCatalogEntry[]}>>;

const definition = (...args: Parameters<typeof createTestRunCatalogHandler>) =>
    createTestRunCatalogHandler(...args) as unknown as CatalogApi;

const catalog: ITestRunCatalogEntry[] = [{method: 'test.sample.flow', name: 'sample flow'}];

describe('createTestRunCatalogHandler', () => {
    it('returns the configured catalog', async () => {
        const methods = definition(catalog)({config: {}});
        await expect(methods['test.run.catalogGet']!()).resolves.toEqual({tests: catalog});
    });

    it('lets the layer config override the fallback', async () => {
        const configured = [{method: 'test.other.flow', name: 'other flow'}];
        const methods = definition(catalog)({config: {tests: configured}});
        await expect(methods['test.run.catalogGet']!()).resolves.toEqual({tests: configured});
    });

    it('can be disabled without exposing the list', async () => {
        const methods = definition(catalog)({config: {enabled: false}});
        await expect(methods['test.run.catalogGet']!()).resolves.toEqual({tests: []});
    });

    it('binds the method name the host supplies', async () => {
        const methods = definition(catalog, 'access.test.runCatalogGet')({config: {}});
        await expect(methods['access.test.runCatalogGet']!()).resolves.toEqual({tests: catalog});
    });
});
