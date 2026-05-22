type Vars = Record<string, unknown>;
type RenderedValue<T> = T extends string ? string : T extends Record<string, unknown> ? {
    [K in keyof T]: RenderedValue<T[K]>;
} : T extends unknown[] ? RenderedValue<T[number]>[] : T;
/**
 * Recursively render all string values in a nested object/array using the
 * trusted engine. Non-string leaf values are returned as-is.
 *
 * @example
 * renderAll({ greeting: 'Hello ${name}!', count: 42 }, { name: 'World' })
 * // => { greeting: 'Hello World!', count: 42 }
 */
export declare function renderAll<T>(value: T, vars?: Vars): RenderedValue<T>;
/**
 * Recursively render all string values in a nested object/array using the
 * sandboxed safe engine.
 */
export declare function safeRenderAll<T>(value: T, vars?: Vars): RenderedValue<T>;
export {};
