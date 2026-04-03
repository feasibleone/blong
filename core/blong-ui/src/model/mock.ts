/**
 * Model system mock — overrides the schema fetcher and dropdown registry
 * with static data for Storybook stories and unit tests.
 *
 * Usage:
 *
 *   import {setupModelMock} from '@feasibleone/blong-ui/model/mock';
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
 * Mirror of ut-rule/model/dropdown.js + ut-rule/model/condition.mock.js.
 */
import {dropdownRegistry} from './dropdownRegistry.js';
import {setFetchFn} from './schemaFetcher.js';
import type {IDropdownOption} from './types.js';

/** Mock OpenAPI document (minimal shape used by schemaFetcher) */
export interface IMockOpenApiDoc {
    paths?: Record<
        string,
        Record<
            string,
            {
                operationId?: string;
                requestBody?: {content?: {'application/json'?: {schema?: Record<string, unknown>}}};
                responses?: {
                    '200'?: {content?: {'application/json'?: {schema?: Record<string, unknown>}}};
                };
            }
        >
    >;
    'x-ui-customizations'?: Record<string, Record<string, unknown>>;
}

export interface IModelMockOptions {
    /** Mock OpenAPI documents keyed by subject name */
    subjects?: Record<string, IMockOpenApiDoc>;
    /** Pre-populated dropdown data keyed by dropdown name */
    dropdowns?: Record<string, IDropdownOption[]>;
}

/**
 * Configure the model system to use mock data instead of HTTP fetches.
 * Call once during Storybook or test setup.
 */
export function setupModelMock(options: IModelMockOptions = {}): void {
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
