import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getObjectSchema, getSubjectApi, setBaseUrl, setFetchFn} from './schemaFetcher.js';

// Reset state between tests
beforeEach(() => {
    setBaseUrl('');
    // Use a failing fetch by default so tests that don't set fetchFn get empty results
    setFetchFn(async () => {
        throw new Error('Unexpected fetch');
    });
});

afterEach(() => {
    // Restore setFetchFn with fetch-based implementation
    setFetchFn(url => fetch(url).then(r => r.json()));
});

describe('setBaseUrl / getSubjectApi', () => {
    it('returns empty object when fetch fails', async () => {
        setFetchFn(async () => {
            throw new Error('Network error');
        });
        const api = await getSubjectApi('marine');
        expect(api).toEqual({});
    });

    it('parses operationId paths from OpenAPI doc', async () => {
        setFetchFn(async () => ({
            paths: {
                '/rpc/marine': {
                    post: {
                        operationId: 'marine.coral.find',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            method: {type: 'string'},
                                            params: {
                                                type: 'object',
                                                properties: {page: {type: 'number'}},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                result: {
                                                    type: 'object',
                                                    properties: {
                                                        coralId: {type: 'string'},
                                                        coralName: {type: 'string'},
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }));
        // Must call setFetchFn with a fresh implementation so that the cache is cleared
        const api = await getSubjectApi('marine2');
        expect(api).toBeDefined();
    });

    it('parses plain (non-JSON-RPC-wrapped) body schemas', async () => {
        setFetchFn(async () => ({
            paths: {
                '/rest': {
                    post: {
                        operationId: 'plain.op',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {name: {type: 'string'}},
                                    },
                                },
                            },
                        },
                        responses: {},
                    },
                },
            },
        }));
        const api = await getSubjectApi('plainSubject');
        expect(api['plain.op']).toBeDefined();
    });

    it('skips operations without operationId', async () => {
        setFetchFn(async () => ({
            paths: {
                '/x': {get: {responses: {}}},
            },
        }));
        const api = await getSubjectApi('skipSubject');
        expect(Object.keys(api)).toHaveLength(0);
    });

    it('caches repeated calls for the same subject', async () => {
        const fetchMock = vi.fn().mockResolvedValue({paths: {}});
        setFetchFn(fetchMock);
        await getSubjectApi('cacheTest');
        await getSubjectApi('cacheTest');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('getObjectSchema', () => {
    it('returns merged schema from find and get operations', async () => {
        setFetchFn(async () => ({
            paths: {
                '/a': {
                    post: {
                        operationId: 'ns.obj.find',
                        requestBody: {content: {'application/json': {schema: {properties: {}}}}},
                        responses: {
                            '200': {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                result: {
                                                    properties: {
                                                        items: {type: 'array'},
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }));
        const schema = await getObjectSchema('ns', 'obj', {properties: {extra: {type: 'string'}}});
        expect(schema).toBeDefined();
        expect((schema as Record<string, unknown>).properties).toBeDefined();
    });

    it('applies browser overlay on top of server schema', async () => {
        setFetchFn(async () => ({paths: {}}));
        const overlay = {properties: {customField: {type: 'boolean'}}};
        const schema = (await getObjectSchema('emptyNs', 'emptyObj', overlay)) as {
            properties: Record<string, unknown>;
        };
        expect(schema.properties?.customField).toEqual({type: 'boolean'});
    });

    it('reads x-ui-customizations from OpenAPI doc', async () => {
        setFetchFn(async () => ({
            paths: {},
            'x-ui-customizations': {
                'custom.obj': {properties: {custField: {type: 'integer'}}},
            },
        }));
        const schema = (await getObjectSchema('custom', 'obj')) as {
            properties: Record<string, unknown>;
        };
        expect(schema.properties?.custField).toEqual({type: 'integer'});
    });

    it('works with no overlay (defaults to empty object)', async () => {
        setFetchFn(async () => ({paths: {}}));
        const schema = await getObjectSchema('bare', 'item');
        expect(schema).toBeDefined();
    });
});
