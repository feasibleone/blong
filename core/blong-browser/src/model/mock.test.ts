import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {dropdownRegistry} from './dropdownRegistry.js';
import {setupModelMock, teardownModelMock} from './mock.js';

beforeEach(() => {
    teardownModelMock();
});

afterEach(() => {
    teardownModelMock();
});

describe('setupModelMock', () => {
    it('registers dropdown options in the registry', () => {
        setupModelMock({
            dropdowns: {
                'marine.species': [{value: 1, label: 'Acropora'}],
                'marine.habitat': [{value: 2, label: 'Reef'}],
            },
        });
        expect(dropdownRegistry.has('marine.species')).toBe(true);
        expect(dropdownRegistry.has('marine.habitat')).toBe(true);
    });

    it('can be called with no arguments (defaults to empty mock)', () => {
        expect(() => setupModelMock()).not.toThrow();
    });

    it('overrides the fetch function with mock data without throwing', () => {
        expect(() => setupModelMock({subjects: {marine: {paths: {}}}})).not.toThrow();
    });

    it('clears the dropdown registry before populating', () => {
        // Pre-populate
        dropdownRegistry.set('old.key', [{value: 0, label: 'Old'}]);
        setupModelMock({dropdowns: {'new.key': [{value: 1, label: 'New'}]}});
        expect(dropdownRegistry.has('old.key')).toBe(false);
        expect(dropdownRegistry.has('new.key')).toBe(true);
    });

    it('uses mock fetch function that returns subject document', async () => {
        const mockDoc = {
            paths: {
                '/rpc/marine': {
                    post: {
                        operationId: 'marine.coral.find',
                        requestBody: {content: {'application/json': {schema: {properties: {}}}}},
                        responses: {},
                    },
                },
            },
        };
        setupModelMock({subjects: {marine: mockDoc}});
        // Import schemaFetcher to call getSubjectApi with the mock
        const {getSubjectApi} = await import('./schemaFetcher.js');
        const api = await getSubjectApi('marine_mock_test');
        expect(api).toBeDefined();
    });
});

describe('teardownModelMock', () => {
    it('clears the dropdown registry', () => {
        dropdownRegistry.set('some.thing', [{value: 1, label: 'X'}]);
        teardownModelMock();
        expect(dropdownRegistry.has('some.thing')).toBe(false);
    });

    it('restores normal fetch behavior without throwing', () => {
        expect(() => teardownModelMock()).not.toThrow();
    });
});
