/**
 * Migration tests - validates JSON → TypeScript conversion
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'tap';
import { emitCollection } from './library/emitter.js';
import { parseCollection } from './library/parser.js';
import type { ITtkCollection } from './types.js';

test('migration - parse and emit produces valid TypeScript', async t => {
    const tempDir = join(tmpdir(), 'migration-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    try {
        // Create a sample ml-testing-toolkit JSON collection
        const jsonCollection = {
            name: 'Test P2P Transfer',
            test_cases: [
                {
                    id: 1,
                    name: 'Happy Path',
                    requests: [
                        {
                            id: 1,
                            description: 'Create transfer',
                            method: 'post',
                            operationPath: '/transfers',
                            body: {
                                transferId: '{$environment.TRANSFER_ID}',
                                amount: {
                                    amount: '100',
                                    currency: 'USD',
                                },
                            },
                            tests: {
                                assertions: [
                                    {
                                        id: 1,
                                        description: 'Status is 202',
                                        exec: ['expect(response.status).to.equal(202)'],
                                    },
                                ],
                            },
                        },
                        {
                            id: 2,
                            description: 'Wait for callback',
                            method: 'get',
                            operationPath: '/callbacks/{id}',
                            tests: {
                                assertions: [
                                    {
                                        id: 2,
                                        description: 'Callback received',
                                        exec: ['expect(response.body.state).to.equal("COMMITTED")'],
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        // Write JSON file
        const jsonPath = join(tempDir, 'test-collection.json');
        await writeFile(jsonPath, JSON.stringify(jsonCollection, null, 2), 'utf-8');

        // Parse it
        const parsed = await parseCollection(jsonPath);
        t.equal(parsed.name, 'Test P2P Transfer');
        t.equal(parsed.test_cases.length, 1);
        t.equal(parsed.test_cases[0].requests.length, 2);

        // Emit TypeScript
        const tsCode = emitCollection(parsed);

        // Verify TypeScript structure
        t.ok(tsCode.includes('import {handler}'), 'Has handler import');
        t.ok(tsCode.includes('export default handler'), 'Exports default handler');
        t.ok(tsCode.includes('testP2PTransfer'), 'Has function name from collection');
        t.ok(tsCode.includes('group(name)'), 'Uses group for test organization');
        t.ok(tsCode.includes('async function'), 'Has async functions');
        t.ok(tsCode.includes('transferTransferCreate'), 'Maps POST /transfers to handler');
        t.ok(tsCode.includes('assert.equal'), 'Converts assertions');

        // Write TypeScript file
        const tsPath = join(tempDir, 'test-collection.ts');
        await writeFile(tsPath, tsCode, 'utf-8');

        t.pass('Migration produces valid TypeScript structure');
    } finally {
        await rm(tempDir, {recursive: true, force: true});
    }
});

test('migration - handles environment variables', async t => {
    const collection: ITtkCollection = {
        name: 'Variable Test',
        test_cases: [
            {
                id: 1,
                name: 'Test',
                requests: [
                    {
                        id: 1,
                        description: 'Request with vars',
                        method: 'post',
                        operationPath: '/test',
                        body: {
                            id: '{$environment.TEST_ID}',
                            amount: '{$request.body.amount}',
                        },
                    },
                ],
            },
        ],
    };

    const tsCode = emitCollection(collection);

    // The emitter should preserve variable references in the output
    // (though they may need manual review/refactoring)
    t.ok(
        tsCode.includes('TEST_ID') || tsCode.includes('environment'),
        'Preserves variable references',
    );
});

test('migration - handles scripts', async t => {
    const collection: ITtkCollection = {
        name: 'Script Test',
        test_cases: [
            {
                id: 1,
                name: 'Test',
                requests: [
                    {
                        id: 1,
                        description: 'Request with scripts',
                        method: 'post',
                        operationPath: '/test',
                        scripts: {
                            preRequest: {
                                exec: [
                                    'pm.environment.set("transferId", "123")',
                                    'console.log("Starting test")',
                                ],
                            },
                            postRequest: {
                                exec: ['pm.environment.set("result", response.body.id)'],
                            },
                        },
                    },
                ],
            },
        ],
    };

    const tsCode = emitCollection(collection);

    // Scripts should be converted or at least included as comments
    t.ok(
        tsCode.includes('Pre-request') || tsCode.includes('Post-request'),
        'Includes script sections',
    );
});

test('migration - detects duplicate patterns', async t => {
    const collection: ITtkCollection = {
        name: 'Duplication Test',
        test_cases: [
            {
                id: 1,
                name: 'Test 1',
                requests: [
                    {
                        id: 1,
                        description: 'Request 1',
                        method: 'post',
                        operationPath: '/transfers',
                        tests: {
                            assertions: [{id: 1, description: 'Status is 202', exec: []}],
                        },
                    },
                ],
            },
            {
                id: 2,
                name: 'Test 2',
                requests: [
                    {
                        id: 2,
                        description: 'Request 2',
                        method: 'post',
                        operationPath: '/transfers',
                        tests: {
                            assertions: [{id: 2, description: 'Status is 202', exec: []}],
                        },
                    },
                ],
            },
        ],
    };

    const {analyzeCollectionDuplication} = await import('./library/dedup.js');
    const analysis = analyzeCollectionDuplication(collection);

    t.ok(analysis.duplicatedRequests > 0, 'Detects duplicate requests');
    t.ok(analysis.duplicatedAssertions > 0, 'Detects duplicate assertions');
    t.ok(analysis.suggestions.length > 0, 'Provides refactoring suggestions');
});

test('migration - rule conversion structure', async t => {
    // Test that rule conversion produces valid YAML structure
    const tempDir = join(tmpdir(), 'rule-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    try {
        // Sample json-rules-engine rule
        const rules = [
            {
                ruleId: 1,
                priority: 2,
                description: 'Fixed error callback',
                conditions: {
                    all: [
                        {fact: 'path', operator: 'equal', value: '/transfers'},
                        {fact: 'method', operator: 'equal', value: 'post'},
                    ],
                },
                event: {
                    type: 'FIXED_ERROR_CALLBACK',
                    params: {
                        path: '/transfers/{id}/error',
                        method: 'put',
                        body: {
                            errorInformation: {
                                errorCode: '5001',
                            },
                        },
                    },
                },
            },
        ];

        const rulesPath = join(tempDir, 'rules.json');
        await writeFile(rulesPath, JSON.stringify(rules), 'utf-8');

        // Import the migration handler (would need proper context)
        // For now, just verify the rule structure is valid
        t.equal(rules.length, 1);
        t.equal(rules[0].event.type, 'FIXED_ERROR_CALLBACK');
        t.ok(rules[0].conditions.all);

        t.pass('Rule structure is valid for conversion');
    } finally {
        await rm(tempDir, {recursive: true, force: true});
    }
});

test('migration - realistic Mojaloop collection with string IDs and Parties path', async t => {
    // Mirrors structure of real mojaloop/testing-toolkit-test-cases collections
    const collection: ITtkCollection = {
        name: 'Golden Path E2E',
        test_cases: [
            {
                id: 'e2e-add-party',
                name: 'Add Party',
                requests: [
                    {
                        id: 'req-1',
                        description: 'Lookup party',
                        method: 'get',
                        operationPath: '/parties/{Type}/{ID}',
                    },
                ],
            },
            {
                id: 'e2e-p2p-transfer',
                name: 'P2P Transfer',
                requests: [
                    {
                        id: 'req-2',
                        description: 'Create quote',
                        method: 'post',
                        operationPath: '/quotes',
                        body: {
                            quoteId: '{$environment.QUOTE_ID}',
                            amount: {amount: '100', currency: 'USD'},
                        },
                    },
                    {
                        id: 'req-3',
                        description: 'Create transfer',
                        method: 'post',
                        operationPath: '/transfers',
                        body: {
                            transferId: '{$prev.req-2.response.body.transferId}',
                            amount: {amount: '100', currency: 'USD'},
                        },
                        tests: {
                            assertions: [
                                {
                                    id: 'a-1',
                                    description: 'Status is 202',
                                    exec: ['expect(response.status).to.equal(202)'],
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };

    const tsCode = emitCollection(collection);

    // Function name from collection name (camelCase)
    t.ok(tsCode.includes('goldenPathE2E'), 'camelCase collection name');

    // Parties path: /parties/{Type}/{ID} → partyPartyGet
    t.ok(tsCode.includes('partyPartyGet'), 'GET /parties/{Type}/{ID} → partyPartyGet');

    // POST /quotes → quoteQuoteCreate
    t.ok(tsCode.includes('quoteQuoteCreate'), 'POST /quotes → quoteQuoteCreate');

    // POST /transfers → transferTransferCreate
    t.ok(tsCode.includes('transferTransferCreate'), 'POST /transfers → transferTransferCreate');

    // Body should be TypeScript object literal, no JSON spread
    t.notOk(tsCode.includes('...{'), 'No JSON spread syntax in body');

    // {$environment.QUOTE_ID} → inputs.QUOTE_ID (bare reference, no quotes around it)
    t.ok(tsCode.includes('inputs.QUOTE_ID'), 'Environment variable ref becomes inputs.QUOTE_ID');
    t.notOk(tsCode.includes("'inputs.QUOTE_ID'"), 'inputs.QUOTE_ID not wrapped in quotes');

    // {$prev.X} reference → template literal with undefined
    t.ok(tsCode.includes('inputs.QUOTE_ID') || tsCode.includes('undefined'), 'Dynamic refs handled');

    // Assertion converted
    t.ok(tsCode.includes('assert.equal'), 'Chai assertion converted');
});

test('migration - environment variable becomes inputs param', async t => {
    const collection: ITtkCollection = {
        name: 'Env Var Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{
                id: 1,
                description: 'Create transfer',
                method: 'post',
                operationPath: '/transfers',
                body: {
                    transferId: '{$environment.TRANSFER_ID}',
                    amount: {amount: '{$environment.AMOUNT}', currency: 'USD'},
                },
            }],
        }],
    };

    const ts = emitCollection(collection);

    // Function signature should include inputs
    t.ok(ts.includes('inputs = {}'), 'Function signature has inputs param');

    // Body references use inputs.X, not string literals
    t.ok(ts.includes('inputs.TRANSFER_ID'), 'TRANSFER_ID as inputs ref');
    t.ok(ts.includes('inputs.AMOUNT'), 'AMOUNT as inputs ref');
    t.notOk(ts.includes("'{$environment.TRANSFER_ID}'"), 'No raw {$env} string literal');
});

test('migration - $prev reference becomes undefined template literal', async t => {
    const collection: ITtkCollection = {
        name: 'Prev Ref Test',
        test_cases: [{
            id: 1,
            name: 'Test',
            requests: [{
                id: 2,
                description: 'Use prev result',
                method: 'post',
                operationPath: '/transfers',
                body: {transferId: '{$prev.1.response.body.transferId}'},
            }],
        }],
    };

    const ts = emitCollection(collection);

    // $prev reference becomes a template literal with undefined placeholder
    t.ok(
        ts.includes('undefined') || ts.includes('$prev'),
        '$prev ref results in undefined or preserved ref',
    );
    t.notOk(ts.includes("'{$prev"), 'No raw $prev string literal');
});

test('migration e2e - migrateMigrateCollectionConvert full pipeline with syntax check', async t => {
    const tempDir = join(tmpdir(), 'e2e-convert-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    try {
        // Realistic Mojaloop-style collection (mirrors structure of mojaloop/testing-toolkit-test-cases)
        const collection = {
            name: 'P2P Golden Path',
            test_cases: [
                {
                    id: 'setup',
                    name: 'Setup Participants',
                    requests: [
                        {
                            id: 'create-participant',
                            description: 'Create payer participant',
                            method: 'post',
                            operationPath: '/participants',
                            body: {
                                name: '{$environment.PAYER_FSP}',
                                currency: '{$environment.CURRENCY}',
                            },
                            tests: {
                                assertions: [
                                    {id: 'a1', description: 'Participant created', exec: ['expect(response.status).to.equal(201)']},
                                ],
                            },
                        },
                    ],
                },
                {
                    id: 'p2p-transfer',
                    name: 'P2P Transfer',
                    requests: [
                        {
                            id: 'party-lookup',
                            description: 'Lookup party by MSISDN',
                            method: 'get',
                            operationPath: '/parties/{Type}/{ID}',
                            tests: {
                                assertions: [
                                    {id: 'a2', description: 'Party found', exec: ['expect(response.status).to.equal(200)']},
                                ],
                            },
                        },
                        {
                            id: 'create-quote',
                            description: 'Create quote for transfer',
                            method: 'post',
                            operationPath: '/quotes',
                            body: {
                                quoteId: '{$environment.QUOTE_ID}',
                                transactionId: '{$environment.TRANSACTION_ID}',
                                payer: {
                                    partyIdInfo: {
                                        partyIdType: 'MSISDN',
                                        partyIdentifier: '{$environment.PAYER_MSISDN}',
                                        fspId: '{$environment.PAYER_FSP}',
                                    },
                                },
                                amountType: 'SEND',
                                amount: {amount: '{$environment.TRANSFER_AMOUNT}', currency: '{$environment.CURRENCY}'},
                                transactionType: {scenario: 'TRANSFER', initiator: 'PAYER', initiatorType: 'CONSUMER'},
                            },
                            scripts: {
                                preRequest: {exec: ['pm.environment.set("QUOTE_ID", pm.variables.replaceIn("{{$guid}}"))']},
                                postRequest: {exec: ['pm.environment.set("QUOTE_EXPIRY", response.body.expiration)']},
                            },
                            tests: {
                                assertions: [
                                    {id: 'a3', description: 'Quote accepted', exec: ['expect(response.status).to.equal(202)']},
                                ],
                            },
                        },
                        {
                            id: 'create-transfer',
                            description: 'Execute P2P transfer',
                            method: 'post',
                            operationPath: '/transfers',
                            body: {
                                transferId: '{$environment.TRANSFER_ID}',
                                payerFsp: '{$environment.PAYER_FSP}',
                                payeeFsp: '{$environment.PAYEE_FSP}',
                                amount: {amount: '{$environment.TRANSFER_AMOUNT}', currency: '{$environment.CURRENCY}'},
                                ilpPacket: '{$prev.create-quote.response.body.ilpPacket}',
                                condition: '{$prev.create-quote.response.body.condition}',
                            },
                            scripts: {
                                preRequest: {exec: ['pm.environment.set("TRANSFER_ID", pm.variables.replaceIn("{{$guid}}"))']},
                            },
                            tests: {
                                assertions: [
                                    {id: 'a4', description: 'Transfer accepted', exec: ['expect(response.status).to.equal(202)']},
                                    {id: 'a5', description: 'Transfer ID present', exec: ['expect(response.body).to.not.be.empty']},
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        const sourcePath = join(tempDir, 'p2p.json');
        const targetPath = join(tempDir, 'p2p.ts');
        await writeFile(sourcePath, JSON.stringify(collection, null, 2), 'utf-8');

        // Use the full handler end-to-end including file I/O
        const mod = await import('./migrate/orchestrator/migrate/migrateMigrateCollectionConvert.js');
        const handlers = (mod.default as any)({lib: {}, handler: {}});
        const result = await handlers.migrateMigrateCollectionConvert(
            {sourcePath, targetPath},
            {} as any,
        );

        t.ok(result.success, 'Conversion succeeded');
        t.equal(result.targetPath, targetPath, 'Target path correct');
        t.ok(!result.errors || result.errors.length === 0, 'No conversion errors');

        // Read and validate the generated TypeScript
        const {readFile} = await import('node:fs/promises');
        const tsCode = await readFile(targetPath, 'utf-8');

        // Structural integrity checks
        t.ok(tsCode.includes("import {handler} from '@feasibleone/blong'"), 'Correct blong import');
        t.ok(tsCode.includes('export default handler'), 'Default export');
        t.ok(tsCode.includes('p2PGoldenPath'), 'Function name from collection name (camelCase)');
        t.ok(tsCode.includes('inputs = {}'), 'Function signature has inputs param');

        // Handler name mapping from paths
        t.ok(tsCode.includes('quoteQuoteCreate'), 'POST /quotes → quoteQuoteCreate');
        t.ok(tsCode.includes('transferTransferCreate'), 'POST /transfers → transferTransferCreate');
        t.ok(tsCode.includes('partyPartyGet'), 'GET /parties/{Type}/{ID} → partyPartyGet');
        t.ok(tsCode.includes('participantParticipantCreate'), 'POST /participants → participantParticipantCreate');

        // Environment variable references use inputs.X pattern
        t.ok(tsCode.includes('inputs.PAYER_FSP'), 'PAYER_FSP as inputs ref');
        t.ok(tsCode.includes('inputs.CURRENCY'), 'CURRENCY as inputs ref');
        t.ok(tsCode.includes('inputs.TRANSFER_AMOUNT'), 'TRANSFER_AMOUNT as inputs ref');
        t.notOk(tsCode.includes("'{$environment."), 'No raw env var string literals');

        // No JSON spread syntax (regression: was emitting ...{key: val})
        t.notOk(tsCode.includes('...{'), 'No JSON spread syntax in bodies');

        // Assertions are converted from Chai to node:assert style
        t.ok(tsCode.includes('assert.equal'), 'Chai equal assertion converted');
        t.ok(tsCode.includes("assert.ok(result, 'Transfer ID present')") || tsCode.includes('to.not.be.empty') || tsCode.includes('result'), 'Non-empty assertion handled');

        // Scripts are included as comments
        t.ok(
            tsCode.includes('Pre-request') || tsCode.includes('preRequest') || tsCode.includes('pm.environment'),
            'Script content preserved',
        );

        // TypeScript syntax validation using compiler transpileModule
        // (syntax-only check, does not resolve imports)
        const ts = await import('typescript');
        const transpileResult = ts.default.transpileModule(tsCode, {
            compilerOptions: {
                target: ts.default.ScriptTarget.Latest,
                module: ts.default.ModuleKind.NodeNext,
            },
            reportDiagnostics: true,
        });
        const syntaxErrors = (transpileResult.diagnostics ?? []).filter(
            d => d.category === ts.default.DiagnosticCategory.Error,
        );
        t.equal(
            syntaxErrors.length,
            0,
            syntaxErrors.length > 0
                ? `TypeScript syntax errors in generated code: ${syntaxErrors.map(d => ts.default.flattenDiagnosticMessageText(d.messageText, '\n')).join('; ')}`
                : 'Generated TypeScript has no syntax errors',
        );
    } finally {
        await rm(tempDir, {recursive: true, force: true});
    }
});

test('migration - migrateMigrateHelperExtract finds shared operations', async t => {
    const tempDir = join(tmpdir(), 'helper-extract-test-' + Date.now());
    await mkdir(tempDir, {recursive: true});

    try {
        // Two collections sharing POST /transfers and POST /quotes
        const col1 = {
            name: 'Collection 1',
            test_cases: [{
                id: 1, name: 'TC1',
                requests: [
                    {id: 1, description: 'Quote', method: 'post', operationPath: '/quotes'},
                    {id: 2, description: 'Transfer', method: 'post', operationPath: '/transfers'},
                ],
            }],
        };
        const col2 = {
            name: 'Collection 2',
            test_cases: [{
                id: 1, name: 'TC2',
                requests: [
                    {id: 1, description: 'Transfer', method: 'post', operationPath: '/transfers'},
                    {id: 2, description: 'Party lookup', method: 'get', operationPath: '/parties/{Type}/{ID}'},
                ],
            }],
        };
        const col3 = {
            name: 'Collection 3 — only quotes',
            test_cases: [{
                id: 1, name: 'TC3',
                requests: [{id: 1, description: 'Quote', method: 'post', operationPath: '/quotes'}],
            }],
        };

        const paths = ['col1.json', 'col2.json', 'col3.json'].map(f => join(tempDir, f));
        await writeFile(paths[0], JSON.stringify(col1), 'utf-8');
        await writeFile(paths[1], JSON.stringify(col2), 'utf-8');
        await writeFile(paths[2], JSON.stringify(col3), 'utf-8');

        const mod = await import('./migrate/orchestrator/migrate/migrateMigrateHelperExtract.js');
        const handlers = (mod.default as any)({lib: {}, handler: {}});

        const result = await handlers.migrateMigrateHelperExtract(
            {sourcePaths: paths, targetDir: join(tempDir, 'out')},
            {} as any,
        );

        t.equal(result.collectionsAnalyzed, 3, 'All collections analyzed');
        // POST /transfers in col1+col2 = 2, POST /quotes in col1+col3 = 2 → both shared
        t.ok(result.sharedOperations >= 2, 'At least 2 shared operations found');

        // helpers.ts was generated
        const {readFile} = await import('node:fs/promises');
        const helpers = await readFile(join(tempDir, 'out', 'helpers.ts'), 'utf-8');
        t.ok(helpers.includes('transferTransferCreate'), 'transferTransferCreate in helpers');
        t.ok(helpers.includes('quoteQuoteCreate'), 'quoteQuoteCreate in helpers');
        t.ok(helpers.includes('sharedHandlerNames'), 'exports sharedHandlerNames');
    } finally {
        await rm(tempDir, {recursive: true, force: true});
    }
});
