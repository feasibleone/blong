/**
 * Trusted template engine using vm.compileFunction.
 *
 * Fast — compiled functions are cached by template string. Suitable for
 * internal config rendering where the template source is trusted (e.g.
 * developer-authored YAML/JSON config files).
 *
 * NOT suitable for templates supplied by end-users — use safeRender instead.
 */
import vm from 'node:vm';
import {escapeForTemplateLiteral} from './escape.ts';
import {helpers} from './helpers.ts';

type RenderFn = (blong: typeof helpers, vars: Record<string, unknown>) => string;

const cache = new Map<string, RenderFn>();

function getCompiledFn(templateStr: string): RenderFn {
    let fn = cache.get(templateStr);
    if (!fn) {
        const escaped = escapeForTemplateLiteral(templateStr);
        // `with` exposes all vars properties as top-level identifiers inside the
        // template literal, just like the original ut-function.template behaviour.
        // The `with` statement is intentional here — this is a trusted-only path.
        // eslint-disable-next-line no-new-func
        fn = vm.compileFunction('with (__vars__) { return `' + escaped + '`; }', [
            'blong',
            '__vars__',
        ]) as RenderFn;
        cache.set(templateStr, fn);
    }
    return fn;
}

/** Render a single trusted template string with the given variables. */
export function render(templateStr: string, vars: Record<string, unknown> = {}): string {
    return getCompiledFn(templateStr)(helpers, vars);
}

/**
 * Compile a trusted template string for repeated use.
 * Returns a render function that accepts a variables object.
 */
export function compile(templateStr: string): (vars?: Record<string, unknown>) => string {
    const fn = getCompiledFn(templateStr);
    return (vars = {}) => fn(helpers, vars);
}
