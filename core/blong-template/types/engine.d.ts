/** Render a single trusted template string with the given variables. */
export declare function render(templateStr: string, vars?: Record<string, unknown>): string;
/**
 * Compile a trusted template string for repeated use.
 * Returns a render function that accepts a variables object.
 */
export declare function compile(templateStr: string): (vars?: Record<string, unknown>) => string;
