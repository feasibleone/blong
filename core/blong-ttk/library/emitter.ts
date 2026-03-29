/**
 * TypeScript code emitter
 *
 * Converts parsed ml-testing-toolkit collections to TypeScript code
 * following Blong handler patterns.
 */

import type { ITtkCollection, ITtkRequest, ITtkTestCase } from '../types.js';

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
    lines.push(`    ${functionName}: ({name = '${collection.name}', inputs = {}}: {name?: string; inputs?: Record<string, string>}, $meta: IMeta) =>`);
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
    lines.push(`${indent}    const result = await ${handlerName}(`);
    lines.push(...emitObjectLiteral(request.body ?? {}, indent + '        '));
    lines.push(`${indent}        $meta,`);
    lines.push(`${indent}    );`);

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
 * Emit a TypeScript object literal as an array of lines
 */
function emitObjectLiteral(value: unknown, indent: string): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [`${indent}{},`];
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${indent}{},`];
    const result = [`${indent}{`];
    for (const [k, v] of entries) {
        result.push(`${indent}    ${k}: ${valueToTs(v, indent + '    ')},`);
    }
    result.push(`${indent}},`);
    return result;
}

/**
 * Convert an arbitrary value to a TypeScript literal string.
 * Handles {$environment.X} -> inputs.X and {$prev...} -> undefined with a TODO comment.
 */
function valueToTs(value: unknown, indent: string): string {
    if (value === null) return 'null';
    if (typeof value === 'string') {
        // Whole value is a single environment variable reference → bare identifier
        const envOnly = /^\{\$environment\.(\w+)\}$/.exec(value);
        if (envOnly) return `inputs.${envOnly[1]}`;

        // Whole value is a $prev / $request / $response reference → TODO
        const dynOnly = /^\{\$(prev|request|response)\.([^}]+)\}$/.exec(value);
        if (dynOnly) return `undefined /* TODO: ${value} */`;

        // String containing embedded variable refs → template literal
        if (/\{\$(?:environment|prev|request|response)\./.test(value)) {
            const template = value
                .replace(/\{\$environment\.(\w+)\}/g, (_, v: string) => '${inputs.' + v + '}')
                .replace(/\{\$(?:prev|request|response)\.[^}]+\}/g, '${undefined}');
            const escapedTemplate = template.replace(/`/g, '\\`');
            return '`' + escapedTemplate + '`';
        }

        const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `'${escaped}'`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return `[${value.map(v => valueToTs(v, indent)).join(', ')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return '{}';
        const props = entries.map(([k, v]) => `${k}: ${valueToTs(v, indent + '    ')}`);
        const inline = `{ ${props.join(', ')} }`;
        if (inline.length < 60) return inline;
        const multiProps = entries.map(([k, v]) => `${indent}    ${k}: ${valueToTs(v, indent + '    ')}`);
        return `{\n${multiProps.join(',\n')},\n${indent}}`;
    }
    return String(value);
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
        // Convert Chai expect(x).to.equal(y) → assert.equal(x, y)
        line = line.replace(/expect\(([^)]+)\)\.to\.equal\(([^)]+)\)/g,
            'assert.equal($1, $2)');

        // Convert expect(x).to.not.be.empty → assert.ok(x)
        line = line.replace(/expect\(([^)]+)\)\.to\.not\.be\.empty/g,
            'assert.ok($1)');

        // Convert expect(x).to.be.empty → assert.equal(x.length, 0)
        line = line.replace(/expect\(([^)]+)\)\.to\.be\.empty/g,
            'assert.equal($1.length, 0)');

        // Leave unrecognised Chai assertions as a comment for manual review
        if (line.includes('expect(') && line.includes('.to.')) {
            return `${indent}// TODO: ${line}`;
        }

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

/** Irregular plural → singular map for common Mojaloop resources */
const IRREGULAR_SINGULARS: Record<string, string> = {
    parties: 'party',
    entries: 'entry',
    currencies: 'currency',
    categories: 'category',
};

/**
 * Singularize a resource name
 * Handles irregular plurals, -ies → -y, and simple trailing -s.
 */
function singularize(word: string): string {
    const lower = word.toLowerCase();
    if (IRREGULAR_SINGULARS[lower]) return IRREGULAR_SINGULARS[lower];
    if (lower.endsWith('ies')) return lower.slice(0, -3) + 'y';
    if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
    return lower;
}

/**
 * Convert operation to semantic triple handler name
 *
 * Examples:
 * - POST /transfers               → transferTransferCreate
 * - GET  /transfers/{ID}          → transferTransferGet
 * - GET  /transfers               → transferTransferFind
 * - PUT  /parties/{Type}/{ID}     → partyPartyUpdate
 * - GET  /quotes/{ID}             → quoteQuoteGet
 */
export function operationToHandlerName(method: string, path: string): string {
    const pathParts = path.split('/').filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1] ?? '';
    const endsWithParam = lastSegment.startsWith('{');

    // Resource is the last non-param path segment
    const resourceParts = pathParts.filter(p => !p.startsWith('{'));
    const resource = resourceParts[resourceParts.length - 1] || 'resource';

    // GET without a trailing path parameter is a list/find operation
    const methodLower = method.toLowerCase();
    const action =
        methodLower === 'get' && !endsWithParam ? 'Find'
        : methodLower === 'get' ? 'Get'
        : methodLower === 'post' ? 'Create'
        : methodLower === 'put' ? 'Update'
        : methodLower === 'patch' ? 'Patch'
        : methodLower === 'delete' ? 'Remove'
        : 'Execute';

    const singular = singularize(resource);
    return `${singular}${capitalize(singular)}${action}`;
}

/**
 * Convert text to camelCase identifier
 * e.g. 'P2P Transfer' → 'p2PTransfer', 'Test P2P Transfer' → 'testP2PTransfer'
 */
function sanitizeIdentifier(text: string): string {
    // Split on non-alphanumeric characters
    const words = text
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);

    if (words.length === 0) return 'collection';

    return words
        .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
        .join('');
}

/**
 * Capitalize first letter
 */
function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
