/**
 * marine/model/mock.ts — mock data for Storybook and unit tests.
 *
 * Provides:
 *  - A minimal OpenAPI doc for the marine subject (substitute for the server)
 *  - Pre-populated dropdown lists for all named dropdowns used in the model
 *
 * Usage:
 *
 *   import {setupModelMock} from '@feasibleone/blong-browser';
 *   import {marineMock} from '../model/mock.js';
 *   setupModelMock(marineMock);
 *
 * Mirrors the pattern from ut-rule/model/dropdown.js + ut-rule/model/condition.mock.js.
 */
import type {IModelMockOptions} from '@feasibleone/blong-browser/src/model/mock.js';

/** Minimal OpenAPI-shaped schema for each marine object */
const marineOpenApi = {
    paths: {
        '/rpc/marine/coral/find': {
            post: {
                operationId: 'marine.coral.find',
                requestBody: {content: {'application/json': {schema: {properties: {jsonrpc: {}, params: {type: 'object', properties: {coralName: {type: 'string'}, familyId: {type: 'integer'}, habitatId: {type: 'integer'}}}}}}}}},
                responses: {'200': {content: {'application/json': {schema: {properties: {result: {type: 'object', properties: {coral: {type: 'array', items: {properties: {coralId: {type: 'integer'}, coralName: {type: 'string'}, familyId: {type: 'integer'}, habitatId: {type: 'integer'}, maxDepth: {type: 'number'}, colorPattern: {type: 'string'}, discovered: {type: 'string', format: 'date'}, description: {type: 'string'}}}}}}}}}}}},
            },
        },
        '/rpc/marine/coral/get': {
            post: {
                operationId: 'marine.coral.get',
                requestBody: {content: {'application/json': {schema: {properties: {jsonrpc: {}, params: {type: 'object', properties: {coralId: {type: 'integer'}}}}}}}},
                responses: {'200': {content: {'application/json': {schema: {properties: {result: {type: 'object', properties: {coral: {type: 'object', properties: {coralId: {type: 'integer'}, coralName: {type: 'string'}, familyId: {type: 'integer'}, habitatId: {type: 'integer'}, maxDepth: {type: 'number'}, colorPattern: {type: 'string'}, discovered: {type: 'string'}, description: {type: 'string'}}}}}}}}}}}},
            },
        },
        '/rpc/marine/habitat/find': {
            post: {
                operationId: 'marine.habitat.find',
                requestBody: {content: {'application/json': {schema: {properties: {jsonrpc: {}, params: {type: 'object'}}}}}},
                responses: {'200': {content: {'application/json': {schema: {properties: {result: {type: 'object', properties: {habitat: {type: 'array', items: {properties: {habitatId: {type: 'integer'}, habitatName: {type: 'string'}, zone: {type: 'string'}, region: {type: 'string'}, minDepth: {type: 'number'}, maxDepth: {type: 'number'}, description: {type: 'string'}}}}}}}}}}}}}},
            },
        },
        '/rpc/marine/species/find': {
            post: {
                operationId: 'marine.species.find',
                requestBody: {content: {'application/json': {schema: {properties: {jsonrpc: {}, params: {type: 'object'}}}}}},
                responses: {'200': {content: {'application/json': {schema: {properties: {result: {type: 'object', properties: {species: {type: 'array', items: {properties: {speciesId: {type: 'integer'}, speciesName: {type: 'string'}, commonName: {type: 'string'}, familyId: {type: 'integer'}, conservationStatus: {type: 'string'}, description: {type: 'string'}}}}}}}}}}}}}},
            },
        },
        '/rpc/marine/family/find': {
            post: {
                operationId: 'marine.family.find',
                requestBody: {content: {'application/json': {schema: {properties: {jsonrpc: {}, params: {type: 'object'}}}}}},
                responses: {'200': {content: {'application/json': {schema: {properties: {result: {type: 'object', properties: {family: {type: 'array', items: {properties: {familyId: {type: 'integer'}, familyName: {type: 'string'}, order: {type: 'string'}, class: {type: 'string'}, description: {type: 'string'}}}}}}}}}}}}}},
            },
        },
    },
};

export const marineMock: IModelMockOptions = {
    subjects: {
        marine: marineOpenApi,
    },
    dropdowns: {
        'marine.family': [
            {value: 1, label: 'Acroporidae'},
            {value: 2, label: 'Faviidae'},
            {value: 3, label: 'Pocilloporidae'},
            {value: 4, label: 'Poritidae'},
        ],
        'marine.habitat': [
            {value: 1, label: 'Great Barrier Reef'},
            {value: 2, label: 'Caribbean Reef System'},
            {value: 3, label: 'Red Sea'},
            {value: 4, label: 'Coral Triangle'},
        ],
        'marine.species': [
            {value: 1, label: 'Acropora palmata'},
            {value: 2, label: 'Porites lobata'},
            {value: 3, label: 'Orbicella faveolata'},
        ],
    },
};
