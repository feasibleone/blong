import {render as trustedRender} from './engine.ts';
import {safeRender} from './safe.ts';

type Vars = Record<string, unknown>;

type RenderedValue<T> = T extends string
    ? string
    : T extends Record<string, unknown>
      ? {[K in keyof T]: RenderedValue<T[K]>}
      : T extends unknown[]
        ? RenderedValue<T[number]>[]
        : T;

/**
 * Recursively render all string values in a nested object/array using the
 * trusted engine. Non-string leaf values are returned as-is.
 *
 * @example
 * renderAll({ greeting: 'Hello ${name}!', count: 42 }, { name: 'World' })
 * // => { greeting: 'Hello World!', count: 42 }
 */
export function renderAll<T>(value: T, vars: Vars = {}): RenderedValue<T> {
    return walkValue(value, vars, trustedRender) as RenderedValue<T>;
}

/**
 * Recursively render all string values in a nested object/array using the
 * sandboxed safe engine.
 */
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
