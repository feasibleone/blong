/**
 * Tests for blong-ttk
 */

import {test} from 'tap';
import {writeFile, mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseCollection, extractVariableReferences, extractCollectionVariables} from './lib/parser.js';
import {analyzeCollectionDuplication, calculateReductionPercentage} from './lib/dedup.js';
import {emitCollection} from './lib/emitter.js';
import type {ITtkCollection} from './types.js';

test('blong-ttk package loads', async t => {
    const pkg = await import('./package.json', {assert: {type: 'json'}});
    t.equal(pkg.default.name, '@feasibleone/blong-ttk');
});

test('server.ts exports default', async t => {
    const server = await import('./server.js');
    t.ok(server.default);
    t.equal(typeof server.default, 'function');
});

// ===== Parser Tests =====

test('parseCollection - basic structure', async t => {
    const tempDir = join(tmpdir(), 'blong-ttk-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});
    
    const collectionPath = join(tempDir, 'test-collection.json');
    const collectionData = {
        name: 'Test Collection',
        test_cases: [
            {
                id: 1,
                name: 'Test Case 1',
                requests: [
                    {
                        id: 1,
                        description: 'POST transfer',
                        method: 'post',
                        operationPath: '/transfers',
                        body: {amount: '100'},
                    },
                ],
            },
        ],
    };
    
    await writeFile(collectionPath, JSON.stringify(collectionData), 'utf-8');
    
    const parsed = await parseCollection(collectionPath);
    
    t.equal(parsed.name, 'Test Collection');
    t.equal(parsed.test_cases.length, 1);
    t.equal(parsed.test_cases[0].name, 'Test Case 1');
    t.equal(parsed.test_cases[0].requests.length, 1);
    t.equal(parsed.test_cases[0].requests[0].method, 'post');
    t.equal(parsed.test_cases[0].requests[0].operationPath, '/transfers');
    
    await rm(tempDir, {recursive: true, force: true});
});

test('extractVariableReferences', async t => {
    const text = 'Amount is {$environment.AMOUNT} and id is {$request.body.transferId}';
    const vars = extractVariableReferences(text);
    
    t.equal(vars.length, 2);
    t.ok(vars.includes('{$environment.AMOUNT}'));
    t.ok(vars.includes('{$request.body.transferId}'));
});

test('extractCollectionVariables', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [
            {
                id: 1,
                name: 'Test',
                requests: [
                    {
                        id: 1,
                        description: 'Test',
                        method: 'post',
                        operationPath: '/test',
                        body: {amount: '{$environment.AMOUNT}'},
                    },
                ],
            },
        ],
    };
    
    const vars = extractCollectionVariables(collection);
    t.ok(vars.has('{$environment.AMOUNT}'));
});

// ===== Deduplication Tests =====

test('analyzeCollectionDuplication - detects duplicated requests', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [
            {
                id: 1,
                name: 'Case 1',
                requests: [
                    {id: 1, description: 'Post 1', method: 'post', operationPath: '/transfers'},
                    {id: 2, description: 'Post 2', method: 'post', operationPath: '/transfers'},
                ],
            },
        ],
    };
    
    const analysis = analyzeCollectionDuplication(collection);
    
    t.equal(analysis.totalRequests, 2);
    t.equal(analysis.duplicatedRequests, 1); // One pattern with 2 occurrences
    t.ok(analysis.suggestions.some(s => s.type === 'request' && s.pattern === 'POST /transfers'));
});

test('analyzeCollectionDuplication - detects duplicated assertions', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [
            {
                id: 1,
                name: 'Case 1',
                requests: [
                    {
                        id: 1,
                        description: 'Req 1',
                        method: 'post',
                        operationPath: '/test',
                        tests: {
                            assertions: [
                                {id: 1, description: 'Status is 202', exec: []},
                            ],
                        },
                    },
                    {
                        id: 2,
                        description: 'Req 2',
                        method: 'post',
                        operationPath: '/test2',
                        tests: {
                            assertions: [
                                {id: 2, description: 'Status is 202', exec: []},
                            ],
                        },
                    },
                ],
            },
        ],
    };
    
    const analysis = analyzeCollectionDuplication(collection);
    
    t.ok(analysis.duplicatedAssertions > 0);
    t.ok(analysis.suggestions.some(s => s.type === 'assertion' && s.pattern === 'Status is 202'));
});

test('calculateReductionPercentage', async t => {
    const analysis = {
        totalRequests: 100,
        duplicatedRequests: 20,
        duplicatedAssertions: 10,
        duplicatedScripts: 5,
        suggestions: [],
    };
    
    const pct = calculateReductionPercentage(analysis);
    t.equal(pct, 35); // (20+10+5)/100 * 100 = 35%
});

// ===== Emitter Tests =====

test('emitCollection - generates valid TypeScript structure', async t => {
    const collection: ITtkCollection = {
        name: 'P2P Transfer',
        test_cases: [
            {
                id: 1,
                name: 'Simple Transfer',
                requests: [
                    {
                        id: 1,
                        description: 'Create transfer',
                        method: 'post',
                        operationPath: '/transfers',
                        body: {amount: '100'},
                    },
                ],
            },
        ],
    };
    
    const ts = emitCollection(collection);
    
    // Check basic structure
    t.ok(ts.includes('import {handler} from'));
    t.ok(ts.includes('export default handler'));
    t.ok(ts.includes('p2PTransfer')); // Function name from collection name
    t.ok(ts.includes('group(name)'));
    t.ok(ts.includes('async function'));
    t.ok(ts.includes('transferTransferCreate')); // Handler name from POST /transfers
});

test('emitCollection - includes assertions', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [
            {
                id: 1,
                name: 'Test',
                requests: [
                    {
                        id: 1,
                        description: 'Test request',
                        method: 'get',
                        operationPath: '/test',
                        tests: {
                            assertions: [
                                {
                                    id: 1,
                                    description: 'Check status',
                                    exec: ['expect(response.status).to.equal(200)'],
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
    
    const ts = emitCollection(collection);
    
    t.ok(ts.includes('assert.equal')); // Chai expect converted to assert
});

// ===== Callback Coordination Tests =====

test('callback store coordination', async t => {
    // Import the callback handlers to test promise coordination
    const {getPendingCallbacks} = await import('./callback/orchestrator/callback/callbackCallbackRegister.js');
    
    const pending = getPendingCallbacks();
    const initialSize = pending.size;
    
    // Verify the store exists and is accessible
    t.ok(pending instanceof Map);
    t.equal(typeof pending.set, 'function');
    t.equal(typeof pending.get, 'function');
    
    // Clean up any test data
    pending.clear();
    t.equal(pending.size, 0);
});
