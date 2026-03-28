/**
 * TypeScript code emitter
 * 
 * Converts parsed ml-testing-toolkit collections to TypeScript code
 * following Blong handler patterns.
 */

import type {ITtkCollection, ITtkTestCase, ITtkRequest} from '../types.js';

/**
 * Emit TypeScript code for a collection
 */
export function emitCollection(collection: ITtkCollection): string {
    const lines: string[] = [];

    // Imports
    lines.push(`import {handler} from '@feasibleone/blong';`);
    lines.push(`import type Assert from 'node:assert';`);
    lines.push(`import type {IMeta} from '@feasibleone/blong';`);
    lines.push(``);

    // Handler wrapper
    lines.push(`export default handler(({lib: {group}, handler: {`);
    
    // Extract unique handler names needed
    const handlerNames = extractHandlerNames(collection);
    lines.push(`    ${handlerNames.join(',\n    ')},`);
    
    lines.push(`}}) => ({`);

    // Generate test collection function
    const functionName = sanitizeIdentifier(collection.name);
    lines.push(`    ${functionName}: ({name = '${collection.name}'}, $meta: IMeta) =>`);
    lines.push(`        group(name)([`);

    // Generate test cases
    for (const testCase of collection.test_cases) {
        lines.push(...emitTestCase(testCase, '            '));
    }

    lines.push(`        ]),`);
    lines.push(`}));`);

    return lines.join('\n');
}

/**
 * Emit TypeScript code for a test case
 */
function emitTestCase(testCase: ITtkTestCase, indent: string): string[] {
    const lines: string[] = [];

    lines.push(`${indent}group('${testCase.name}')([`);

    for (const request of testCase.requests) {
        lines.push(...emitRequest(request, indent + '    '));
    }

    lines.push(`${indent}]),`);

    return lines;
}

/**
 * Emit TypeScript code for a request
 */
function emitRequest(request: ITtkRequest, indent: string): string[] {
    const lines: string[] = [];

    // Generate function name from description
    const functionName = sanitizeIdentifier(request.description);
    
    lines.push(`${indent}async function ${functionName}(assert: typeof Assert, {$meta}) {`);

    // Pre-request script
    if (request.scripts?.preRequest) {
        lines.push(`${indent}    // Pre-request script`);
        lines.push(...convertScript(request.scripts.preRequest.exec, indent + '    '));
    }

    // API call
    const handlerName = operationToHandlerName(request.method, request.operationPath);
    lines.push(`${indent}    const result = await ${handlerName}({`);
    
    // Add body parameters
    if (request.body) {
        const bodyStr = JSON.stringify(request.body, null, 8).split('\n');
        bodyStr.forEach((line, i) => {
            if (i === 0) {
                lines.push(`${indent}        ...${line},`);
            } else if (i === bodyStr.length - 1) {
                lines.push(`${indent}${line},`);
            } else {
                lines.push(`${indent}${line}`);
            }
        });
    }
    
    lines.push(`${indent}    }, $meta);`);

    // Assertions
    if (request.tests?.assertions) {
        lines.push(``);
        for (const assertion of request.tests.assertions) {
            lines.push(...convertAssertion(assertion.exec, indent + '    '));
        }
    }

    // Post-request script
    if (request.scripts?.postRequest) {
        lines.push(`${indent}    // Post-request script`);
        lines.push(...convertScript(request.scripts.postRequest.exec, indent + '    '));
    }

    lines.push(`${indent}    return result;`);
    lines.push(`${indent}},`);
    lines.push(``);

    return lines;
}

/**
 * Convert JavaScript script lines to TypeScript
 */
function convertScript(lines: string[], indent: string): string[] {
    return lines.map(line => {
        // Convert pm.environment.set to variable assignment
        line = line.replace(/pm\.environment\.set\(['"](\w+)['"],\s*(.+)\)/g, 
            'const $1 = $2');
        
        // Convert pm.environment.get to variable reference
        line = line.replace(/pm\.environment\.get\(['"](\w+)['"]\)/g, '$1');
        
        return `${indent}${line}`;
    });
}

/**
 * Convert assertion lines to assert statements
 */
function convertAssertion(lines: string[], indent: string): string[] {
    return lines.map(line => {
        // Convert Chai expect to assert
        line = line.replace(/expect\((\w+)\.status\)\.to\.equal\((\d+)\)/g,
            'assert.equal($1.status, $2)');
        
        line = line.replace(/expect\((\w+)\.body\.(\w+)\)\.to\.equal\((.+)\)/g,
            'assert.equal($1.body.$2, $3)');
        
        return `${indent}${line};`;
    });
}

/**
 * Extract unique handler names needed for imports
 */
function extractHandlerNames(collection: ITtkCollection): string[] {
    const names = new Set<string>();

    for (const testCase of collection.test_cases) {
        for (const request of testCase.requests) {
            const name = operationToHandlerName(request.method, request.operationPath);
            names.add(name);
        }
    }

    // Add common handlers
    names.add('callbackWait');
    names.add('callbackRegister');

    return Array.from(names).sort();
}

/**
 * Convert operation to semantic triple handler name
 * 
 * Examples:
 * - POST /transfers -> transferTransferCreate
 * - GET /quotes/{ID} -> quoteQuoteGet
 * - PUT /parties/{Type}/{ID} -> partyPartyUpdate
 */
function operationToHandlerName(method: string, path: string): string {
    // Extract resource from path
    const parts = path.split('/').filter(p => p && !p.startsWith('{'));
    const resource = parts[parts.length - 1] || 'resource';
    
    // Convert method to action
    const methodMap: Record<string, string> = {
        get: 'Get',
        post: 'Create',
        put: 'Update',
        patch: 'Patch',
        delete: 'Remove',
    };
    
    const action = methodMap[method.toLowerCase()] || 'Execute';
    
    // Singularize resource (simple approach)
    const singular = resource.endsWith('s') 
        ? resource.slice(0, -1) 
        : resource;
    
    return `${singular}${capitalize(singular)}${action}`;
}

/**
 * Sanitize identifier for use as function name
 */
function sanitizeIdentifier(text: string): string {
    return text
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_')
        .replace(/^(\d)/, '_$1');
}

/**
 * Capitalize first letter
 */
function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
