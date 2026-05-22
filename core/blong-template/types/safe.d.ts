/** Render a template string in a sandboxed context with the given variables. */
export declare function safeRender(templateStr: string, vars?: Record<string, unknown>): string;
/**
 * Compile a template string and return a sandboxed render function.
 * The escaped template is pre-computed; a fresh context is still
 * created on each invocation to maintain variable isolation.
 */
export declare function safeCompile(templateStr: string): (vars?: Record<string, unknown>) => string;
