export type { BlongHelpers } from './helpers.ts';
export { escapeHtml, escapeJson, escapeXml, htmlTag, jsonTag, xmlTag } from './escape.ts';
export { helpers } from './helpers.ts';
/** Render a template string with the given variables. */
export declare function render(templateStr: string, vars?: Record<string, unknown>): string;
/**
 * Compile a template string for repeated use.
 * Returns a render function that accepts a variables object.
 */
export declare function compile(templateStr: string): (vars?: Record<string, unknown>) => string;
type Vars = Record<string, unknown>;
type RenderedValue<T> = T extends string ? string : T extends Record<string, unknown> ? {
    [K in keyof T]: RenderedValue<T[K]>;
} : T extends unknown[] ? RenderedValue<T[number]>[] : T;
/**
 * Recursively render all string values in a nested object/array.
 * Non-string leaf values are returned as-is.
 *
 * @example
 * renderAll({ page: 'portal.${type}Demo', id: 42 }, { type: 'coral' })
 * // => { page: 'portal.coralDemo', id: 42 }
 */
export declare function renderAll<T>(value: T, vars?: Vars): RenderedValue<T>;
/**
 * Render a template string in the acorn-based sandbox.
 * Only provided variables and `blong` helpers are in scope; no browser
 * globals are accessible.
 */
export declare function safeRender(templateStr: string, vars?: Vars): string;
/**
 * Compile a template string for repeated sandboxed use.
 * Re-parses the AST on each call (no caching — safe for user-provided templates
 * which change frequently and must not accumulate in memory).
 */
export declare function safeCompile(templateStr: string): (vars?: Vars) => string;
/** Recursively render all string values in a nested object/array (sandboxed). */
export declare function safeRenderAll<T>(value: T, vars?: Vars): RenderedValue<T>;
