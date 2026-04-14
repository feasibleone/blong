/**
 * Model system mock — overrides the schema fetcher and dropdown registry
 * with static data for Storybook stories and unit tests.
 *
 * Usage:
 *
 *   import {setupModelMock} from '@feasibleone/blong-browser/model/mock';
 *
 *   setupModelMock({
 *     subjects: {
 *       marine: {
 *         paths: { ... }  // OpenAPI paths mock
 *       }
 *     },
 *     dropdowns: {
 *       'marine.species': [{value: 1, label: 'Acropora'}],
 *       'marine.habitat': [{value: 1, label: 'Coral Reef'}],
 *     }
 *   });
 *
 */
import type {IMock} from '@feasibleone/blong';
import {dropdownRegistry} from './dropdownRegistry.js';
import {setFetchFn} from './schemaFetcher.js';

/**
 * Configure the model system to use mock data instead of HTTP fetches.
 * Call once during Storybook or test setup.
 */
export function setupModelMock(options: IMock = {}): void {
    const {subjects = {}, dropdowns = {}} = options;

    // Override the schema fetcher with a synchronous mock
    setFetchFn(async (url: string) => {
        // url = /rpc/{subject}/openapi.json
        const subject = url.split('/')[2];
        return subjects[subject] ?? {paths: {}};
    });

    // Pre-populate dropdown cache
    dropdownRegistry.clear();
    for (const [name, options] of Object.entries(dropdowns)) {
        dropdownRegistry.set(name, options);
    }
}

/**
 * Clear mock state (call in afterEach if needed).
 */
export function teardownModelMock(): void {
    // Re-instate the real fetch
    setFetchFn(url => fetch(url).then(r => r.json()));
    dropdownRegistry.clear();
}
