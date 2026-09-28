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
 * Add a folder to a realm `browser.ts` children declaration.
 *
 * A realm lists the `./meta` folders it loads **twice**: once as
 * `import.meta.glob([...])` patterns for the browser bundle, and once as plain
 * directories for the non-window branch of the same ternary (the server platform
 * discovers layer folders itself, but the browser one loads nothing it is not
 * told about). A folder that has to be there in both is added to both lists:
 *
 *     import.meta.glob(['./meta/model', './browser'])
 *  →  import.meta.glob(['./meta/model', './browser', './meta/fixture'])
 *     : ['./meta/model', './browser']
 *  →  : ['./meta/model', './browser', './meta/fixture']
 *
 * A glob list (one holding a `*` pattern) gains a pattern, a directory list the
 * folder itself. Arrays are found by their entries rather than by the property in
 * front of them, because the declarations differ per realm — a literal
 * `import.meta.glob(` has no property, and the else branch of the ternary has no
 * name of its own. What every such list shares is a `./meta` entry, so that is
 * the anchor; an array of something else is left untouched.
 *
 * The existing layout is preserved (a multi-line list stays multi-line, one
 * entry per line), so a spliced file is what prettier would have written.
 * Idempotent, and `undefined` when no `./meta` list is found — the caller warns
 * and points at the array by hand instead of rewriting a file it does not
 * understand.
 */
export function appendChildFolder(source: string, folder: string): string | undefined {
    // The folder's top-level namespace (`./meta` for `./meta/fixture`): the part
    // every children list has in common, whatever it lists beside it.
    const anchor = folder.split('/').slice(0, 2).join('/');
    let found = false;
    let changed = false;
    const next = source.replace(/\[([^[\]]*)\]/g, whole => {
        const body = whole.slice(1, -1);
        const entries = body
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean);
        if (!entries.some(entry => unquote(entry).startsWith(anchor))) return whole;
        found = true;
        // A glob list takes the pattern, a directory list the folder itself.
        const entry = entries.some(value => value.includes('*')) ? `${folder}/**/*.ts` : folder;
        if (entries.map(unquote).includes(entry)) return whole;
        changed = true;
        return `[${withEntry(body, entry)}]`;
    });
    if (!found) return undefined;
    return changed ? next : source;
}

/**
 * Insert `'entry'` after the last element of an array literal body, keeping the
 * body's own layout: the indentation of the last entry and the whitespace before
 * the closing bracket. A single-line body gains `, 'entry'`.
 */
function withEntry(body: string, entry: string): string {
    const trimmed = body.replace(/\s+$/, '');
    const trailing = body.slice(trimmed.length);
    if (!trimmed.includes('\n')) {
        return `${trimmed}${trimmed.endsWith(',') ? ' ' : ', '}'${entry}'`;
    }
    const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1);
    const indent = /^\s*/.exec(lastLine)?.[0] ?? '';
    const comma = trimmed.endsWith(',') ? '' : ',';
    return `${trimmed}${comma}\n${indent}'${entry}',${trailing}`;
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
