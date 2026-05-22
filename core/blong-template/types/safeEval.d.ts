type Vars = Record<string, unknown>;
/**
 * Render a template string using acorn-based sandboxed evaluation.
 * The `blong` helpers are automatically in scope; all other names must be
 * passed via `vars`.
 */
export declare function safeRenderTemplate(templateStr: string, vars: Vars): string;
export {};
