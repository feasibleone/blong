/**
 * Browser-compatible template engine.
 *
 * Uses the `Function` constructor instead of `vm.compileFunction` so the same
 * template syntax works in browsers.  The template syntax and `blong.*` helpers
 * are identical to the trusted server engine — only the compilation mechanism
 * differs.
 *
 * Security: intended for developer-authored templates in configuration and
 * schema files.  Do NOT use for templates written by end-users.
 *
 * This module is selected automatically by bundlers (Vite, webpack, etc.) via
 * the `"browser"` condition in package.json exports. It does not import
 * `node:vm` or any other Node.js-specific module.
 */
import {escapeForTemplateLiteral} from './escape.ts';
import {helpers} from './helpers.ts';
import {safeRenderTemplate} from './safeEval.ts';

// Re-export everything that is browser-safe so consumers get the same surface
// regardless of whether they are in a server or browser environment.
export {escapeHtml, escapeJson, escapeXml, htmlTag, jsonTag, xmlTag} from './escape.ts';
export {helpers} from './helpers.ts';
export type {BlongHelpers} from './helpers.ts';

type RenderFn = (blong: typeof helpers, vars: Record<string, unknown>) => string;

const cache = new Map<string, RenderFn>();

function getCompiledFn(templateStr: string): RenderFn {
    let fn = cache.get(templateStr);
    if (!fn) {
        const escaped = escapeForTemplateLiteral(templateStr);
        // `with` exposes all vars properties as top-level identifiers inside the
        // template literal — same behaviour as the server engine.
        // The `with` statement is intentional here; this is a trusted-only path.
        // eslint-disable-next-line no-new-func
        fn = new Function(
            'blong',
            '__vars__',
            'with (__vars__) { return `' + escaped + '`; }',
        ) as RenderFn;
        cache.set(templateStr, fn);
    }
    return fn;
}

/** Render a template string with the given variables. */
export function render(templateStr: string, vars: Record<string, unknown> = {}): string {
    return getCompiledFn(templateStr)(helpers, vars);
}

/**
 * Compile a template string for repeated use.
 * Returns a render function that accepts a variables object.
 */
export function compile(templateStr: string): (vars?: Record<string, unknown>) => string {
    const fn = getCompiledFn(templateStr);
    return (vars = {}) => fn(helpers, vars);
}

type Vars = Record<string, unknown>;

type RenderedValue<T> = T extends string
    ? string
    : T extends Record<string, unknown>
      ? {[K in keyof T]: RenderedValue<T[K]>}
      : T extends unknown[]
        ? RenderedValue<T[number]>[]
        : T;

/**
 * Recursively render all string values in a nested object/array.
 * Non-string leaf values are returned as-is.
 *
 * @example
 * renderAll({ page: 'portal.${type}Demo', id: 42 }, { type: 'coral' })
 * // => { page: 'portal.coralDemo', id: 42 }
 */
export function renderAll<T>(value: T, vars: Vars = {}): RenderedValue<T> {
    return walkValue(value, vars, render) as RenderedValue<T>;
}

/**
 * Render a template string in the acorn-based sandbox.
 * Only provided variables and `blong` helpers are in scope; no browser
 * globals are accessible.
 */
export function safeRender(templateStr: string, vars: Vars = {}): string {
    return safeRenderTemplate(templateStr, vars);
}

/**
 * Compile a template string for repeated sandboxed use.
 * Re-parses the AST on each call (no caching — safe for user-provided templates
 * which change frequently and must not accumulate in memory).
 */
export function safeCompile(templateStr: string): (vars?: Vars) => string {
    return (vars = {}) => safeRenderTemplate(templateStr, vars);
}

/** Recursively render all string values in a nested object/array (sandboxed). */
export function safeRenderAll<T>(value: T, vars: Vars = {}): RenderedValue<T> {
    return walkValue(value, vars, safeRender) as RenderedValue<T>;
}

function walkValue(value: unknown, vars: Vars, renderFn: (t: string, v: Vars) => string): unknown {
    if (typeof value === 'string') {
        return renderFn(value, vars);
    }
    if (Array.isArray(value)) {
        return value.map(item => walkValue(item, vars, renderFn));
    }
    if (value !== null && typeof value === 'object') {
        if (value.constructor !== Object) return value;
        const result: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
            result[key] = walkValue(v, vars, renderFn);
        }
        return result;
    }
    return value;
}
