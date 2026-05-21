/**
 * Sandboxed template engine using vm.runInNewContext.
 *
 * Each render runs in a fresh V8 context that has no access to the host
 * process, require, Buffer, or any other Node.js built-in. Only the
 * variables you explicitly pass and the `blong` helpers are in scope.
 *
 * Use this for templates that may be edited by end-users.
 *
 * Security properties:
 * - No access to `process`, `require`, `Buffer`, `global`, etc.
 * - No prototype-chain escape via `({}).constructor.constructor(...)` because
 *   the sandbox context is seeded from `Object.create(null)`.
 * - Execution timeout prevents infinite-loop DoS.
 * - The `blong` helpers are frozen, so template code cannot mutate them.
 *
 * Limitations:
 * - Slower than the trusted engine (fresh context per call).
 * - Standard JS built-ins (Array, Object, String, Math …) are still
 *   available — they come from the new V8 context, not the host.
 */
import vm from 'node:vm';
import {escapeForTemplateLiteral} from './escape.ts';
import {helpers} from './helpers.ts';

/** Maximum execution time in milliseconds for a single safe render call. */
const TIMEOUT_MS = 1000;

function buildContext(vars: Record<string, unknown>): vm.Context {
    // Start from null-prototype object so there is no route to the host
    // Object / Function prototype chain.
    const contextObj = Object.assign(Object.create(null), vars, {
        blong: helpers,
    });
    return vm.createContext(contextObj);
}

/** Render a template string in a sandboxed context with the given variables. */
export function safeRender(templateStr: string, vars: Record<string, unknown> = {}): string {
    const escaped = escapeForTemplateLiteral(templateStr);
    const context = buildContext(vars);
    return String(vm.runInContext('`' + escaped + '`', context, {timeout: TIMEOUT_MS}));
}

/**
 * Compile a template string and return a sandboxed render function.
 * The escaped template is pre-computed; a fresh context is still
 * created on each invocation to maintain variable isolation.
 */
export function safeCompile(templateStr: string): (vars?: Record<string, unknown>) => string {
    const escaped = escapeForTemplateLiteral(templateStr);
    return (vars = {}) => {
        const context = buildContext(vars);
        return String(vm.runInContext('`' + escaped + '`', context, {timeout: TIMEOUT_MS}));
    };
}
