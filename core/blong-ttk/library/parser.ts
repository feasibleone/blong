/**
 * ml-testing-toolkit JSON parser
 * 
 * Parses the ml-testing-toolkit JSON test collection format into structured objects.
 */

import {readFile} from 'node:fs/promises';
import type {
    ITtkCollection,
    ITtkTestCase,
    ITtkRequest,
    ITtkAssertion,
} from '../types.js';

/**
 * Parse ml-testing-toolkit JSON collection file
 * 
 * @param filepath - Path to JSON collection file
 * @returns Parsed collection structure
 */
export async function parseCollection(filepath: string): Promise<ITtkCollection> {
    const content = await readFile(filepath, 'utf-8');
    const json = JSON.parse(content);

    // Validate basic structure
    if (!json.name || !json.test_cases) {
        throw new Error(`Invalid collection format in ${filepath}: missing name or test_cases`);
    }

    return {
        name: json.name,
        test_cases: json.test_cases.map(parseTestCase),
    };
}

/**
 * Parse a test case
 */
function parseTestCase(tc: any): ITtkTestCase {
    return {
        id: tc.id,
        name: tc.name,
        requests: (tc.requests || []).map(parseRequest),
    };
}

/**
 * Parse a request
 */
function parseRequest(req: any): ITtkRequest {
    return {
        id: req.id,
        description: req.description || '',
        apiVersion: req.apiVersion,
        operationPath: req.operationPath || req.path,
        method: req.method.toLowerCase(),
        headers: req.headers || {},
        body: req.body,
        params: req.params,
        tests: req.tests ? {
            assertions: (req.tests.assertions || []).map(parseAssertion),
        } : undefined,
        scripts: req.scripts ? {
            preRequest: req.scripts.preRequest ? {
                exec: req.scripts.preRequest.exec || [],
            } : undefined,
            postRequest: req.scripts.postRequest ? {
                exec: req.scripts.postRequest.exec || [],
            } : undefined,
        } : undefined,
    };
}

/**
 * Parse an assertion
 */
function parseAssertion(assertion: any): ITtkAssertion {
    return {
        id: assertion.id,
        description: assertion.description || '',
        exec: assertion.exec || [],
    };
}

/**
 * Extract environment variable references from scripts and body
 * 
 * Finds patterns like:
 * - {$environment.VARIABLE_NAME}
 * - {$request.body.path}
 * - {$response.body.path}
 */
export function extractVariableReferences(text: string): string[] {
    const pattern = /\{\$(?:environment|request|response|prev)\.[\w.]+\}/g;
    const matches = text.match(pattern);
    return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Extract variable references from an entire collection
 */
export function extractCollectionVariables(collection: ITtkCollection): Set<string> {
    const variables = new Set<string>();

    for (const testCase of collection.test_cases) {
        for (const request of testCase.requests) {
            // Check body
            if (request.body) {
                const bodyStr = JSON.stringify(request.body);
                extractVariableReferences(bodyStr).forEach(v => variables.add(v));
            }

            // Check scripts
            if (request.scripts?.preRequest) {
                request.scripts.preRequest.exec.forEach(line => {
                    extractVariableReferences(line).forEach(v => variables.add(v));
                });
            }
            if (request.scripts?.postRequest) {
                request.scripts.postRequest.exec.forEach(line => {
                    extractVariableReferences(line).forEach(v => variables.add(v));
                });
            }

            // Check assertions
            if (request.tests?.assertions) {
                request.tests.assertions.forEach(assertion => {
                    assertion.exec.forEach(line => {
                        extractVariableReferences(line).forEach(v => variables.add(v));
                    });
                });
            }
        }
    }

    return variables;
}
