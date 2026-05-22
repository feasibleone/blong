/**
 * Sandboxed template evaluator using acorn for AST-based expression parsing.
 *
 * Security properties:
 *  - Only explicitly provided variables and the `blong` helpers are in scope.
 *    There is no access to `window`, `document`, `globalThis`, `fetch`,
 *    `process`, `require`, or any other ambient global.
 *  - Prototype-chain escapes are blocked: `__proto__`, `constructor`,
 *    `prototype` and related properties always resolve to FAIL.
 *  - Arbitrary code execution paths are disabled: `new` expressions,
 *    `await`, `yield`, assignment, and arrow/function expressions all
 *    result in FAIL (an `unknown identifier` error to the caller).
 *  - Spread elements in arrays and call arguments are not supported.
 *
 * Supported expression features for template ${…} interpolations:
 *  - Literals (string, number, boolean, null)
 *  - Identifiers (from provided vars + blong helpers)
 *  - Template literals and tagged templates (e.g. blong.xml`…`)
 *  - Member access (a.b, a['b'], optional a?.b)
 *  - Call expressions (fn(), obj.method(), optional obj?.method())
 *  - Binary and logical operators (+, -, *, /, %, **, ===, !==, <, >, &&, ||, ??)
 *  - Unary operators (!, -, +, ~, void, typeof)
 *  - Conditional (ternary) expressions
 *  - Array and object literals
 */
import * as acorn from 'acorn';
import {escapeForTemplateLiteral} from './escape.ts';
import {helpers} from './helpers.ts';

type Vars = Record<string, unknown>;

/** Sentinel value returned when a node cannot be evaluated safely. */
const FAIL: unique symbol = Symbol('fail');

/** Properties whose access is always blocked regardless of the object. */
const BLOCKED = new Set([
    '__proto__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'constructor',
    'prototype',
]);

function walk(node: acorn.Node, vars: Vars): unknown {
    switch (node.type) {
        case 'Literal':
            return (node as acorn.Literal).value;

        case 'Identifier': {
            const {name} = node as acorn.Identifier;
            if (name === 'undefined') return undefined;
            if (name === 'Infinity') return Infinity;
            if (name === 'NaN') return NaN;
            if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
            return FAIL;
        }

        case 'TemplateLiteral': {
            const {quasis, expressions} = node as acorn.TemplateLiteral;
            let str = '';
            for (let i = 0; i < quasis.length; i++) {
                str += quasis[i].value.cooked ?? '';
                if (i < expressions.length) {
                    const val = walk(expressions[i] as acorn.Node, vars);
                    if (val === FAIL) return FAIL;
                    str += String(val);
                }
            }
            return str;
        }

        case 'TaggedTemplateExpression': {
            const {tag, quasi} = node as acorn.TaggedTemplateExpression;
            const fn = walk(tag as acorn.Node, vars);
            if (fn === FAIL || typeof fn !== 'function') return FAIL;

            // Build a TemplateStringsArray with both cooked and raw strings
            const cooked = quasi.quasis.map(q => q.value.cooked ?? '');
            const raw = quasi.quasis.map(q => q.value.raw);
            const strings = Object.assign([...cooked], {raw}) as TemplateStringsArray;

            const values = quasi.expressions.map(e => {
                const v = walk(e as acorn.Node, vars);
                return v === FAIL ? undefined : v;
            });

            const ctx =
                tag.type === 'MemberExpression'
                    ? walk((tag as acorn.MemberExpression).object as acorn.Node, vars)
                    : null;

            return fn.apply(ctx === FAIL ? null : ctx, [strings, ...values]);
        }

        case 'UnaryExpression': {
            const {operator, argument} = node as acorn.UnaryExpression;
            // `typeof` must not throw for unknown identifiers
            if (operator === 'typeof') {
                const v = walk(argument as acorn.Node, vars);
                return v === FAIL ? 'undefined' : typeof v;
            }
            if (operator === 'void') return undefined;
            const v = walk(argument as acorn.Node, vars);
            if (v === FAIL) return FAIL;
            if (operator === '!') return !v;
            if (operator === '-') return -(v as number);
            if (operator === '+') return +(v as number);
            if (operator === '~') return ~(v as number);
            return FAIL;
        }

        case 'LogicalExpression': {
            const {operator, left, right} = node as acorn.LogicalExpression;
            const l = walk(left as acorn.Node, vars);
            if (l === FAIL) return FAIL;
            // Short-circuit: only evaluate right side when needed
            if (operator === '&&') return l ? walk(right as acorn.Node, vars) : l;
            if (operator === '||') return l ? l : walk(right as acorn.Node, vars);
            if (operator === '??') return l != null ? l : walk(right as acorn.Node, vars);
            return FAIL;
        }

        case 'BinaryExpression': {
            const {operator, left, right} = node as acorn.BinaryExpression;
            const l = walk(left as acorn.Node, vars);
            if (l === FAIL) return FAIL;
            const r = walk(right as acorn.Node, vars);
            if (r === FAIL) return FAIL;
            switch (operator) {
                case '+': return (l as number) + (r as number);
                case '-': return (l as number) - (r as number);
                case '*': return (l as number) * (r as number);
                case '/': return (l as number) / (r as number);
                case '%': return (l as number) % (r as number);
                case '**': return (l as number) ** (r as number);
                case '===': return l === r;
                case '!==': return l !== r;
                case '==': return l == r; // eslint-disable-line eqeqeq
                case '!=': return l != r; // eslint-disable-line eqeqeq
                case '<': return (l as number) < (r as number);
                case '<=': return (l as number) <= (r as number);
                case '>': return (l as number) > (r as number);
                case '>=': return (l as number) >= (r as number);
                case '|': return (l as number) | (r as number);
                case '&': return (l as number) & (r as number);
                case '^': return (l as number) ^ (r as number);
            }
            return FAIL;
        }

        case 'ConditionalExpression': {
            const {test, consequent, alternate} = node as acorn.ConditionalExpression;
            const cond = walk(test as acorn.Node, vars);
            if (cond === FAIL) return FAIL;
            return cond
                ? walk(consequent as acorn.Node, vars)
                : walk(alternate as acorn.Node, vars);
        }

        case 'MemberExpression': {
            const me = node as acorn.MemberExpression;
            const obj = walk(me.object as acorn.Node, vars);
            if (obj === FAIL) return me.optional ? undefined : FAIL;
            if (obj == null) return me.optional ? undefined : FAIL;

            let prop: unknown;
            if (me.computed) {
                prop = walk(me.property as acorn.Node, vars);
                if (prop === FAIL) return FAIL;
            } else {
                prop = (me.property as acorn.Identifier).name;
            }

            if (typeof prop === 'string' && BLOCKED.has(prop)) return FAIL;
            return (obj as Record<string, unknown>)[prop as string];
        }

        case 'ChainExpression':
            // Optional chaining wrapper — just recurse; optional flag is on the
            // inner MemberExpression / CallExpression.
            return walk((node as acorn.ChainExpression).expression as acorn.Node, vars);

        case 'CallExpression': {
            const ce = node as acorn.CallExpression;
            const fn = walk(ce.callee as acorn.Node, vars);
            if (fn === FAIL) return ce.optional ? undefined : FAIL;
            if (fn == null) return ce.optional ? undefined : FAIL;
            if (typeof fn !== 'function') return FAIL;

            let ctx: unknown = null;
            if (ce.callee.type === 'MemberExpression') {
                ctx = walk((ce.callee as acorn.MemberExpression).object as acorn.Node, vars);
                if (ctx === FAIL) ctx = null;
            }

            const args: unknown[] = [];
            for (const arg of ce.arguments) {
                if (arg.type === 'SpreadElement') return FAIL;
                const v = walk(arg as acorn.Node, vars);
                if (v === FAIL) return FAIL;
                args.push(v);
            }

            return fn.apply(ctx, args);
        }

        case 'ArrayExpression': {
            const result: unknown[] = [];
            for (const el of (node as acorn.ArrayExpression).elements) {
                if (el === null) {
                    result.push(undefined);
                    continue;
                }
                if (el.type === 'SpreadElement') return FAIL;
                const v = walk(el as acorn.Node, vars);
                if (v === FAIL) return FAIL;
                result.push(v);
            }
            return result;
        }

        case 'ObjectExpression': {
            const result: Record<string, unknown> = {};
            for (const p of (node as acorn.ObjectExpression).properties) {
                if (p.type !== 'Property') return FAIL;
                const prop = p as acorn.Property;
                let key: unknown;
                if (prop.computed) {
                    key = walk(prop.key as acorn.Node, vars);
                    if (key === FAIL) return FAIL;
                } else if (prop.key.type === 'Identifier') {
                    key = (prop.key as acorn.Identifier).name;
                } else {
                    key = (prop.key as acorn.Literal).value;
                }
                const val = walk(prop.value as acorn.Node, vars);
                if (val === FAIL) return FAIL;
                result[key as string] = val;
            }
            return result;
        }

        default:
            return FAIL;
    }
}

/**
 * Render a template string using acorn-based sandboxed evaluation.
 * The `blong` helpers are automatically in scope; all other names must be
 * passed via `vars`.
 */
export function safeRenderTemplate(templateStr: string, vars: Vars): string {
    const escaped = escapeForTemplateLiteral(templateStr);
    let ast: acorn.Expression;
    try {
        ast = acorn.parseExpressionAt('`' + escaped + '`', 0, {ecmaVersion: 2022});
    } catch (e) {
        throw new SyntaxError(`Template syntax error: ${(e as Error).message}`);
    }

    const scope: Vars = {...vars, blong: helpers};
    const result = walk(ast as acorn.Node, scope);

    if (result === FAIL) {
        throw new ReferenceError(`Template references an undefined variable`);
    }
    return String(result);
}
