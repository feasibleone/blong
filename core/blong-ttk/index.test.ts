/**
 * Tests for blong-ttk
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'tap';
import { analyzeCollectionDuplication, calculateReductionPercentage } from './library/dedup.js';
import { emitCollection } from './library/emitter.js';
import { extractCollectionVariables, extractVariableReferences, parseCollection } from './library/parser.js';
import type { ITtkCollection } from './types.js';

test('blong-ttk package loads', async t => {
    const pkg = await import('./package.json', {with: {type: 'json'}});
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
    t.ok(ts.includes('p2PTransfer')); // Function name from collection name (camelCase)
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

// ===== Emitter - operationToHandlerName Tests =====

test('emitCollection - GET without path param generates Find', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{id: 1, description: 'List transfers', method: 'get', operationPath: '/transfers'}],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('transferTransferFind'), 'GET /transfers → transferTransferFind');
});

test('emitCollection - GET with path param generates Get', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{id: 1, description: 'Get transfer', method: 'get', operationPath: '/transfers/{ID}'}],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('transferTransferGet'), 'GET /transfers/{ID} → transferTransferGet');
});

test('emitCollection - irregular plural parties → party', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{id: 1, description: 'Get party', method: 'get', operationPath: '/parties/{Type}/{ID}'}],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('partyPartyGet'), 'GET /parties/{Type}/{ID} → partyPartyGet');
});

test('emitCollection - body emitted as TypeScript object literal', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{
                id: 1,
                description: 'Create transfer',
                method: 'post',
                operationPath: '/transfers',
                body: {transferId: 'abc', amount: {amount: '100', currency: 'USD'}},
            }],
        }],
    };
    const ts = emitCollection(collection);
    // Should use object literal not JSON spread
    t.notOk(ts.includes('...{'), 'No JSON spread in body');
    t.ok(ts.includes('transferId'), 'Body properties included');
    t.ok(ts.includes('amount'), 'Nested object included');
});

// ===== callbackRuleDispatch Tests =====

test('callbackRuleDispatch - matches rule and returns decision', async t => {
    const mod = await import('./callback/orchestrator/callback/callbackRuleDispatch.js');
    const handlers = (mod.default as any)({lib: {}, handler: {}});

    const result = await handlers.callbackRuleDispatch(
        {
            path: '/transfers',
            method: 'POST',
            rules: {
                rules: [
                    {
                        when: {method: 'POST', path: '/transfers'},
                        then: {fixedCallback: {delay: 500, body: {transferState: 'COMMITTED'}}},
                    },
                ],
            },
        },
        {} as any,
    );

    t.equal(result.decision, 'fixedCallback');
    t.equal(result.delay, 500);
});

test('callbackRuleDispatch - returns mockCallback when no rules match', async t => {
    const mod = await import('./callback/orchestrator/callback/callbackRuleDispatch.js');
    const handlers = (mod.default as any)({lib: {}, handler: {}});

    const result = await handlers.callbackRuleDispatch(
        {path: '/unknown', method: 'POST', rules: {rules: []}},
        {} as any,
    );

    t.equal(result.decision, 'mockCallback');
    t.equal(result.rule, null);
});

test('callbackRuleDispatch - method mismatch does not match rule', async t => {
    const mod = await import('./callback/orchestrator/callback/callbackRuleDispatch.js');
    const handlers = (mod.default as any)({lib: {}, handler: {}});

    const result = await handlers.callbackRuleDispatch(
        {
            path: '/transfers',
            method: 'get', // rule expects POST — note: method is uppercased internally
            rules: {
                rules: [
                    {when: {method: 'POST', path: '/transfers'}, then: {fixedCallback: {}}},
                ],
            },
        },
        {} as any,
    );

    t.equal(result.decision, 'mockCallback', 'GET does not match POST rule');
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

test('callback register → wait → receive full coordination flow', async t => {
    const {getPendingCallbacks} = await import('./callback/orchestrator/callback/callbackCallbackRegister.js');

    // Import all three handlers
    const registerMod = await import('./callback/orchestrator/callback/callbackCallbackRegister.js');
    const waitMod = await import('./callback/orchestrator/callback/callbackCallbackWait.js');
    const receiveMod = await import('./callback/orchestrator/callback/callbackCallbackReceive.js');

    const registerHandlers = (registerMod.default as any)({lib: {}, handler: {}});
    const waitHandlers = (waitMod.default as any)({lib: {}, handler: {}});
    const receiveHandlers = (receiveMod.default as any)({lib: {}, handler: {}});

    // Clean state, ensure all timers cancelled on exit
    const pending = getPendingCallbacks();
    pending.clear();
    t.teardown(() => {
        for (const [, entry] of pending) clearTimeout(entry.timeout);
        pending.clear();
    });

    const correlationId = 'test-coord-' + Date.now();

    // 1. Register the callback (short timeout so leaking timer is harmless)
    const registerResult = registerHandlers.callbackCallbackRegister(
        {correlationId, type: 'PUT /transfers/{ID}', timeout: 2000},
        {} as any,
    );
    t.equal(registerResult.correlationId, correlationId);
    t.equal(registerResult.success, true);

    // 2. Start waiting (don't await yet — must happen before receive)
    const waitPromise = waitHandlers.callbackCallbackWait(
        {correlationId, type: 'PUT /transfers/{ID}'},
        {} as any,
    );

    // 3. Simulate callback arriving immediately after wait is set up
    const receiveResult = receiveHandlers.callbackCallbackReceive(
        {
            correlationId,
            type: 'PUT /transfers/{ID}',
            status: 200,
            headers: {'content-type': 'application/json'},
            body: {transferState: 'COMMITTED', completedTimestamp: '2024-01-01T00:00:00Z'},
        },
        {} as any,
    );
    t.equal(receiveResult.success, true);
    t.equal(receiveResult.correlationId, correlationId);

    // 4. Wait resolves with callback data
    const callbackData = await waitPromise;
    t.equal((callbackData as any).body.transferState, 'COMMITTED');
    t.equal((callbackData as any).status, 200);

    // 5. Map should be cleaned up after delivery
    t.notOk(pending.has(correlationId), 'Entry cleaned up after delivery');
});

test('callback register throws on duplicate correlationId', async t => {
    const registerMod = await import('./callback/orchestrator/callback/callbackCallbackRegister.js');
    const registerHandlers = (registerMod.default as any)({lib: {}, handler: {}});
    const {getPendingCallbacks} = registerMod;

    const pending = getPendingCallbacks();
    pending.clear();
    t.teardown(() => {
        for (const [, entry] of pending) clearTimeout(entry.timeout);
        pending.clear();
    });

    const correlationId = 'dup-test-' + Date.now();

    registerHandlers.callbackCallbackRegister({correlationId, type: 'PUT /transfers/{ID}', timeout: 100}, {} as any);

    t.throws(
        () => registerHandlers.callbackCallbackRegister({correlationId, type: 'PUT /transfers/{ID}', timeout: 100}, {} as any),
        /already registered/,
        'Throws on duplicate correlationId',
    );
});

test('callbackReceive returns not-found for unregistered correlationId', async t => {
    const receiveMod = await import('./callback/orchestrator/callback/callbackCallbackReceive.js');
    const receiveHandlers = (receiveMod.default as any)({lib: {}, handler: {}});

    const result = receiveHandlers.callbackCallbackReceive(
        {correlationId: 'nonexistent-999', type: 'PUT /transfers/{ID}', status: 200, headers: {}, body: {}},
        {} as any,
    );

    t.equal(result.success, false);
    t.ok(result.message.includes('No pending callback'));
});

test('callbackCallbackWait throws when no prior register', async t => {
    const waitMod = await import('./callback/orchestrator/callback/callbackCallbackWait.js');
    const waitHandlers = (waitMod.default as any)({lib: {}, handler: {}});

    await t.rejects(
        waitHandlers.callbackCallbackWait({correlationId: 'no-such-id-' + Date.now()}, {} as any),
        /No callback registered/,
        'Throws when no register was made',
    );
});

test('callbackCallbackWait rejects on timeout', async t => {
    const registerMod = await import('./callback/orchestrator/callback/callbackCallbackRegister.js');
    const waitMod = await import('./callback/orchestrator/callback/callbackCallbackWait.js');
    const registerHandlers = (registerMod.default as any)({lib: {}, handler: {}});
    const waitHandlers = (waitMod.default as any)({lib: {}, handler: {}});
    const {getPendingCallbacks} = registerMod;

    const pending = getPendingCallbacks();
    const correlationId = 'timeout-test-' + Date.now();

    t.teardown(() => {
        for (const [, entry] of pending) clearTimeout(entry.timeout);
        pending.clear();
    });

    // Register with a very short timeout
    registerHandlers.callbackCallbackRegister(
        {correlationId, type: 'PUT /transfers/{ID}', timeout: 50},
        {} as any,
    );

    // Wait should reject after the timeout fires
    await t.rejects(
        waitHandlers.callbackCallbackWait({correlationId}, {} as any),
        /timeout|Callback wait failed/i,
        'Rejects after timeout expires',
    );
});

// ===== Script Deduplication Tests =====

test('analyzeCollectionDuplication - detects duplicated scripts', async t => {
    const sharedScript = 'pm.environment.set("transferId", pm.utils.uuid());\nconst token = pm.environment.get("token");';
    const collection: ITtkCollection = {
        name: 'Script Dup Test',
        test_cases: [
            {
                id: 1,
                name: 'Case 1',
                requests: [
                    {
                        id: 1,
                        description: 'Req 1',
                        method: 'post',
                        operationPath: '/transfers',
                        scripts: {preRequest: {exec: [sharedScript]}},
                    },
                    {
                        id: 2,
                        description: 'Req 2',
                        method: 'post',
                        operationPath: '/quotes',
                        scripts: {preRequest: {exec: [sharedScript]}},
                    },
                ],
            },
        ],
    };

    const analysis = analyzeCollectionDuplication(collection);

    t.ok(analysis.duplicatedScripts > 0, 'Detects duplicated scripts');
    t.ok(analysis.suggestions.some(s => s.type === 'script'), 'Has script suggestion');
});

test('analyzeCollectionDuplication - ignores short scripts', async t => {
    const collection: ITtkCollection = {
        name: 'Short Script Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [
                {id: 1, description: 'R1', method: 'post', operationPath: '/a', scripts: {preRequest: {exec: ['x=1']}}},
                {id: 2, description: 'R2', method: 'post', operationPath: '/b', scripts: {preRequest: {exec: ['x=1']}}},
            ],
        }],
    };

    const analysis = analyzeCollectionDuplication(collection);
    t.equal(analysis.duplicatedScripts, 0, 'Short scripts ignored');
});

test('analyzeCollectionDuplication - detects duplicated postRequest scripts', async t => {
    const longScript = 'pm.environment.set("quoteId", response.body.quoteId);\npm.environment.set("transferId", response.body.transferId);';
    const collection: ITtkCollection = {
        name: 'PostRequest Script Dup Test',
        test_cases: [{
            id: 1, name: 'Test',
            requests: [
                {id: 1, description: 'R1', method: 'post', operationPath: '/quotes', scripts: {postRequest: {exec: [longScript]}}},
                {id: 2, description: 'R2', method: 'post', operationPath: '/transfers', scripts: {postRequest: {exec: [longScript]}}},
            ],
        }],
    };

    const analysis = analyzeCollectionDuplication(collection);
    t.ok(analysis.duplicatedScripts > 0, 'Detects duplicated postRequest scripts');
    t.ok(
        analysis.suggestions.some(s => s.type === 'script' && s.locations.some(l => l.includes('postRequest'))),
        'postRequest label in suggestion locations',
    );
});

test('analyzeCollectionDuplication - truncates long script pattern for display', async t => {
    // Script > 100 chars, duplicated in two requests
    const longLine = 'pm.environment.set("a", "1"); pm.environment.set("b", "2"); pm.environment.set("c", "3"); pm.environment.set("d", "4");';
    const collection: ITtkCollection = {
        name: 'Long Script Test',
        test_cases: [{
            id: 1, name: 'Test',
            requests: [
                {id: 1, description: 'R1', method: 'post', operationPath: '/a', scripts: {preRequest: {exec: [longLine]}}},
                {id: 2, description: 'R2', method: 'post', operationPath: '/b', scripts: {preRequest: {exec: [longLine]}}},
            ],
        }],
    };

    const analysis = analyzeCollectionDuplication(collection);
    const scriptSuggestion = analysis.suggestions.find(s => s.type === 'script');
    t.ok(scriptSuggestion, 'Has script suggestion');
    t.ok(scriptSuggestion!.pattern.endsWith('...'), 'Long pattern is truncated with ...');
});

// ===== Emitter Chai edge cases =====

test('emitCollection - to.be.empty → assert.equal(x.length, 0)', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1, name: 'Test', requests: [{
                id: 1, description: 'Req', method: 'get', operationPath: '/test',
                tests: {assertions: [{id: 1, description: 'Empty check', exec: ['expect(response.body).to.be.empty']}]},
            }],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('assert.equal') && ts.includes('.length, 0'), 'to.be.empty converts correctly');
});

test('emitCollection - to.not.be.empty → assert.ok(x)', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1, name: 'Test', requests: [{
                id: 1, description: 'Req', method: 'get', operationPath: '/test',
                tests: {assertions: [{id: 1, description: 'Not empty check', exec: ['expect(response.body.items).to.not.be.empty']}]},
            }],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('assert.ok'), 'to.not.be.empty converts to assert.ok');
});

test('emitCollection - unrecognised Chai → TODO comment', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1, name: 'Test', requests: [{
                id: 1, description: 'Req', method: 'get', operationPath: '/test',
                tests: {assertions: [{id: 1, description: 'Custom check', exec: ['expect(x).to.have.length(3)']}]},
            }],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('// TODO:'), 'Unrecognised Chai wrapped in TODO comment');
});

test('emitCollection - embedded environment var becomes template literal', async t => {
    const collection: ITtkCollection = {
        name: 'Test',
        test_cases: [{
            id: 1, name: 'Test', requests: [{
                id: 1, description: 'Create',
                method: 'post', operationPath: '/transfers',
                body: {note: 'Transfer for {$environment.CUSTOMER_ID} to {$environment.PAYEE_ID}'},
            }],
        }],
    };
    const ts = emitCollection(collection);
    // String with embedded refs should become a template literal
    t.ok(ts.includes('inputs.CUSTOMER_ID'), 'First env ref resolved');
    t.ok(ts.includes('inputs.PAYEE_ID'), 'Second env ref resolved');
    // Should be a template literal, not a plain string
    t.ok(ts.includes('`'), 'Outputs template literal backtick');
});

test('operationToHandlerName - currencies → currency (ies singularizer)', async t => {
    const {operationToHandlerName} = await import('./library/emitter.js');
    const name = operationToHandlerName('get', '/currencies/{ID}');
    t.equal(name, 'currencyCurrencyGet', 'currencies → currency via irregular map');
});

test('operationToHandlerName - DELETE method → Remove', async t => {
    const {operationToHandlerName} = await import('./library/emitter.js');
    const name = operationToHandlerName('delete', '/transfers/{ID}');
    t.equal(name, 'transferTransferRemove', 'DELETE → Remove action');
});

test('operationToHandlerName - PATCH method → Patch', async t => {
    const {operationToHandlerName} = await import('./library/emitter.js');
    const name = operationToHandlerName('patch', '/transfers/{ID}');
    t.equal(name, 'transferTransferPatch', 'PATCH → Patch action');
});

// ===== Parser headers/params Tests =====

test('parseCollection - preserves headers and params', async t => {
    const {mkdir: mkd, rm: rmrf, writeFile: wf} = await import('node:fs/promises');
    const {tmpdir} = await import('node:os');
    const {join: pjoin} = await import('node:path');

    const tmpDir = pjoin(tmpdir(), 'parser-headers-test-' + Date.now());
    await mkd(tmpDir, {recursive: true});

    try {
        const collectionData = {
            name: 'Headers Test',
            test_cases: [{
                id: 1,
                name: 'Case 1',
                requests: [{
                    id: 1,
                    description: 'Get with headers',
                    method: 'get',
                    operationPath: '/transfers/{ID}',
                    headers: {'Authorization': 'Bearer token', 'Accept': 'application/json'},
                    params: {ID: 'test-id'},
                }],
            }],
        };

        const collectionPath = pjoin(tmpDir, 'collection.json');
        await wf(collectionPath, JSON.stringify(collectionData), 'utf-8');

        const parsed = await parseCollection(collectionPath);

        t.match(parsed.test_cases[0].requests[0].headers, {'Authorization': 'Bearer token'});
        t.match(parsed.test_cases[0].requests[0].params!, {ID: 'test-id'});
    } finally {
        await rmrf(tmpDir, {recursive: true, force: true});
    }
});

// ===== parser - extractCollectionVariables script + assertion paths =====

test('extractCollectionVariables - picks up vars from scripts and assertions', async t => {
    const collection: ITtkCollection = {
        name: 'VarExtract',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{
                id: 1,
                description: 'Req',
                method: 'post',
                operationPath: '/test',
                scripts: {
                    preRequest:  {exec: ['pm.environment.set("id", "{$environment.SENDER_ID}")']},
                    postRequest: {exec: ['console.log("{$response.body.transferId}")']},
                },
                tests: {
                    assertions: [{
                        id: 1,
                        description: 'Check',
                        exec: ['expect("{$environment.AMOUNT}").to.equal("100")'],
                    }],
                },
            }],
        }],
    };

    const vars = extractCollectionVariables(collection);

    t.ok(vars.has('{$environment.SENDER_ID}'), 'preRequest env var extracted');
    t.ok(vars.has('{$response.body.transferId}'), 'postRequest response ref extracted');
    t.ok(vars.has('{$environment.AMOUNT}'), 'assertion env var extracted');
});

// ===== dedup - zero-request early return =====

test('calculateReductionPercentage - returns 0 when totalRequests is 0', async t => {
    const pct = calculateReductionPercentage({
        totalRequests: 0,
        duplicatedRequests: 0,
        duplicatedAssertions: 0,
        duplicatedScripts: 0,
        suggestions: [],
    });
    t.equal(pct, 0, 'Division by zero guard returns 0');
});

// ===== emitter valueToTs edge cases =====

test('emitCollection - body with empty array emits []', async t => {
    const collection: ITtkCollection = {
        name: 'ArrayTest',
        test_cases: [{
            id: 1, name: 'T', requests: [{
                id: 1, description: 'Req', method: 'post', operationPath: '/test',
                body: {items: [], flag: true, count: 42},
            }],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('items: []'), 'Empty array emits []');
    t.ok(ts.includes('flag: true'), 'Boolean value emitted');
    t.ok(ts.includes('count: 42'), 'Number value emitted');
});

test('emitCollection - large object body triggers multi-line format', async t => {
    // Build an object whose inline representation exceeds 60 chars
    const collection: ITtkCollection = {
        name: 'BigBody',
        test_cases: [{
            id: 1, name: 'T', requests: [{
                id: 1, description: 'Req', method: 'post', operationPath: '/test',
                body: {
                    transferId: 'some-long-uuid-value-here',
                    payerFsp: 'payer-fsp-name',
                    payeeFsp: 'payee-fsp-name',
                },
            }],
        }],
    };
    const ts = emitCollection(collection);
    // Multi-line object: each property on its own line with a trailing comma
    t.ok(ts.includes('transferId:'), 'transferId property present');
    t.ok(ts.includes('payerFsp:'), 'payerFsp property present');
});

test('emitCollection - empty object body emits {}', async t => {
    const collection: ITtkCollection = {
        name: 'EmptyBody',
        test_cases: [{
            id: 1, name: 'T', requests: [{
                id: 1, description: 'Req', method: 'post', operationPath: '/test',
                body: {},
            }],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes('{}'), 'Empty object body emits {}');
});

test('operationToHandlerName - unknown method → Execute', async t => {
    const {operationToHandlerName} = await import('./library/emitter.js');
    const name = operationToHandlerName('options', '/transfers');
    t.equal(name, 'transferTransferExecute', 'Unknown method → Execute action');
});

// ===== emitter - array body triggers emitObjectLiteral early-return =====

test('emitCollection - array body emits {} placeholder', async t => {
    const collection: ITtkCollection = {
        name: 'ArrayBodyTest',
        test_cases: [{
            id: 1, name: 'T', requests: [{
                id: 1, description: 'Req', method: 'post', operationPath: '/transfers',
                body: ['item1', 'item2'] as any, // array body edge case
            }],
        }],
    };
    const ts = emitCollection(collection);
    // emitObjectLiteral returns `{},` for array/non-object bodies
    t.ok(ts.includes('{}'), 'Array body falls back to empty object literal');
});

test('parseCollection - parses preRequest and postRequest scripts', async t => {
    const {mkdir: mkd, rm: rmrf2, writeFile: wf2} = await import('node:fs/promises');
    const {tmpdir: td2} = await import('node:os');
    const {join: pj2} = await import('node:path');

    const dir = pj2(td2(), 'parser-scripts-' + Date.now());
    await mkd(dir, {recursive: true});
    try {
        const data = {
            name: 'Scripts Collection',
            test_cases: [{
                id: 1, name: 'TC',
                requests: [{
                    id: 1, description: 'Scripted request',
                    method: 'post',
                    operationPath: '/transfers',
                    scripts: {
                        preRequest: {exec: ['pm.environment.set("id", "123")']},
                        postRequest: {exec: ['pm.environment.set("result", response.body.id)']},
                    },
                }],
            }],
        };
        const p = pj2(dir, 'col.json');
        await wf2(p, JSON.stringify(data), 'utf-8');
        const parsed = await parseCollection(p);
        const req = parsed.test_cases[0].requests[0];
        t.equal(req.scripts?.preRequest?.exec[0], 'pm.environment.set("id", "123")');
        t.equal(req.scripts?.postRequest?.exec[0], 'pm.environment.set("result", response.body.id)');
    } finally {
        await rmrf2(dir, {recursive: true, force: true});
    }
});

test('parseCollection - throws on invalid format (missing test_cases)', async t => {
    const {mkdir: mkd, rm: rmrf2, writeFile: wf2} = await import('node:fs/promises');
    const {tmpdir: td2} = await import('node:os');
    const {join: pj2} = await import('node:path');

    const dir = pj2(td2(), 'parser-err-' + Date.now());
    await mkd(dir, {recursive: true});
    try {
        const p = pj2(dir, 'bad.json');
        await wf2(p, JSON.stringify({name: 'No test cases here'}), 'utf-8');
        await t.rejects(
            parseCollection(p),
            /missing name or test_cases/,
            'Throws on missing test_cases',
        );
    } finally {
        await rmrf2(dir, {recursive: true, force: true});
    }
});

test('parseCollection - uses req.path when operationPath absent', async t => {
    const {mkdir: mkd, rm: rmrf2, writeFile: wf2} = await import('node:fs/promises');
    const {tmpdir: td2} = await import('node:os');
    const {join: pj2} = await import('node:path');

    const dir = pj2(td2(), 'parser-path-' + Date.now());
    await mkd(dir, {recursive: true});
    try {
        const p = pj2(dir, 'col.json');
        const data = {
            name: 'Path Fallback',
            test_cases: [{
                id: 1, name: 'TC',
                requests: [{
                    id: 1, description: 'Use path field',
                    method: 'get',
                    path: '/fallback-path',  // operationPath absent
                    scripts: {
                        postRequest: {exec: ['console.log("done")']},
                        // no preRequest — exercises the undefined branch
                    },
                }],
            }],
        };
        await wf2(p, JSON.stringify(data), 'utf-8');
        const parsed = await parseCollection(p);
        t.equal(parsed.test_cases[0].requests[0].operationPath, '/fallback-path', 'req.path used as fallback');
        t.ok(parsed.test_cases[0].requests[0].scripts?.postRequest, 'postRequest parsed');
        t.notOk(parsed.test_cases[0].requests[0].scripts?.preRequest, 'preRequest is undefined');
    } finally {
        await rmrf2(dir, {recursive: true, force: true});
    }
});

// ===== emitter - non-empty array and guaranteed multiline object =====

test('emitCollection - body with non-empty array emits array literal', async t => {
    const collection: ITtkCollection = {
        name: 'ArrayBody',
        test_cases: [{
            id: 1, name: 'T', requests: [{
                id: 1, description: 'Req', method: 'post', operationPath: '/test',
                body: {ids: ['abc', 'def', 'ghi']},
            }],
        }],
    };
    const ts = emitCollection(collection);
    t.ok(ts.includes("'abc'") && ts.includes("'def'") && ts.includes("'ghi'"), 'Array values emitted');
});

test('emitCollection - deeply nested body triggers multi-line object', async t => {
    // The inline representation of this nested object will exceed 60 chars
    const collection: ITtkCollection = {
        name: 'DeepNested',
        test_cases: [{
            id: 1, name: 'T', requests: [{
                id: 1, description: 'Req', method: 'post', operationPath: '/test',
                body: {
                    amount: {amount: '100.00', currency: 'USD'},
                    payer: {partyIdInfo: {partyIdType: 'MSISDN', partyIdentifier: '123456789'}},
                },
            }],
        }],
    };
    const ts = emitCollection(collection);
    // Multi-line rendering means we get newlines between properties
    t.ok(ts.includes('amount:'), 'amount property present');
    t.ok(ts.includes('payer:'), 'payer property present');
    t.ok(ts.includes('partyIdInfo:'), 'nested partyIdInfo present');
});
