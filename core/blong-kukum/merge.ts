/**
 * Text-level merge helpers.
 *
 * Generators that write *shared* files — the platform bootstrap that lists test
 * groups, the schema registry that orders tables, the Playwright spec that holds
 * one `describe` per entity — must extend what is already there rather than
 * replace it, or adding an entity silently drops the one added before it.
 *
 * These helpers are deliberately narrow: each one recognises a single, stable
 * shape that a kukum template emits, and returns `undefined` when it does not
 * find that shape so the caller can fall back to a plain overwrite and warn
 * instead of corrupting the file. They are pure string transforms, so they are
 * cheap to unit test and carry no parser dependency.
 */

import type {PrimitiveHost} from './engine.ts';

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const unquote = (value: string): string => value.trim().replace(/^['"`]|['"`]$/g, '');

/**
 * Append a string to an array literal, e.g.
 *
 *     watch: {test: ['test.widget']}  →  watch: {test: ['test.widget', 'test.other']}
 *
 * Used to register a generated test group in the platform's
 * `integration.watch.test` list. Idempotent: an existing entry is left as-is.
 */
export function appendStringEntry(
    source: string,
    property: string,
    value: string,
): string | undefined {
    const pattern = new RegExp(`(${escapeRegExp(property)}\\s*:\\s*\\[)([\\s\\S]*?)(\\])`);
    const match = pattern.exec(source);
    if (!match) return undefined;
    const [whole, open, body, close] = match;
    const entries = body
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    if (entries.map(unquote).includes(value)) return source;
    const next = [...entries, `'${value}'`].join(', ');
    return `${source.slice(0, match.index)}${open}${next}${close}${source.slice(match.index + whole.length)}`;
}

/**
 * Insert an entry into an object literal, e.g.
 *
 *     tables: {'shop.order': 1}  →  tables: {'shop.order': 1, 'shop.entry': 2}
 *
 * Used to register a table in `meta/db/db.ts` without dropping the tables other
 * entities already registered. Idempotent.
 */
export function insertMapEntry(
    source: string,
    property: string,
    key: string,
    value: string | number,
): string | undefined {
    const pattern = new RegExp(`(${escapeRegExp(property)}\\s*:\\s*\\{)([\\s\\S]*?)(\\})`);
    const match = pattern.exec(source);
    if (!match) return undefined;
    const [whole, open, body, close] = match;
    const entries = body
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    const keys = entries.map(entry => unquote(entry.split(':')[0] ?? ''));
    if (keys.includes(key)) return source;
    const rendered = typeof value === 'number' ? String(value) : `'${value}'`;
    const next = [...entries, `'${key}': ${rendered}`].join(', ');
    return `${source.slice(0, match.index)}${open}${next}${close}${source.slice(match.index + whole.length)}`;
}

/** True when `source` already declares a top-level YAML key. */
export function hasYamlKey(source: string, key: string): boolean {
    return new RegExp(`^${escapeRegExp(key)}\\s*:`, 'm').test(source);
}

/**
 * Append comma-separated values to a YAML scalar, e.g.
 *
 *     e2eManage: e2eWidgetAdd,e2eWidgetFind
 *  →  e2eManage: e2eWidgetAdd,e2eWidgetFind,e2eGadgetAdd,e2eGadgetFind
 *
 * Used to grant a newly added entity's capabilities to a role. Also matches
 * indented keys. Idempotent.
 */
export function appendCommaListValue(
    source: string,
    key: string,
    values: string[],
): string | undefined {
    const pattern = new RegExp(`^(\\s*${escapeRegExp(key)}\\s*:\\s*)(\\S.*)$`, 'm');
    const match = pattern.exec(source);
    if (!match) return undefined;
    const [whole, prefix, body] = match;
    const existing = body
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const missing = values.filter(value => !existing.includes(value));
    if (!missing.length) return source;
    const next = [...existing, ...missing].join(',');
    return `${source.slice(0, match.index)}${prefix}${next}${source.slice(match.index + whole.length)}`;
}

/**
 * Read a shared template artifact that is not TypeScript, so it never carries
 * the generated marker (YAML seeds, for example).
 */
export function readPlainSource(
    host: PrimitiveHost,
    root: string,
    path: string,
): string | undefined {
    const absolute = host.join(root, path);
    if (!host.existsSync(absolute)) return undefined;
    return String(host.readFileSync(absolute, {encoding: 'utf-8'}));
}

/**
 * Append a top-level block to a YAML document, keeping the existing content (and
 * its comments) untouched. Idempotent: a document that already declares `key` is
 * returned unchanged.
 */
export function appendYamlBlock(source: string, key: string, block: string): string {
    if (hasYamlKey(source, key)) return source;
    return `${source.replace(/\s*$/, '')}\n${block.replace(/\s*$/, '')}\n`;
}

/** True when a Playwright spec already contains `test.describe('title'`. */
export function hasDescribeBlock(source: string, title: string): boolean {
    return new RegExp(`test\\.describe\\(\\s*['"\`]${escapeRegExp(title)}['"\`]`).test(source);
}

/**
 * Append a Playwright `test.describe` block to a spec, before the trailing
 * newline. Idempotent: an existing block with the same title is left alone.
 */
export function appendDescribeBlock(source: string, title: string, block: string): string {
    if (hasDescribeBlock(source, title)) return source;
    return `${source.replace(/\s*$/, '')}\n\n${block.replace(/\s*$/, '')}\n`;
}
