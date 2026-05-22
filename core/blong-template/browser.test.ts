/**
 * Browser-specific tests for the acorn-based sandboxed template rendering.
 * Although named browser.test.ts, acorn is pure JavaScript and runs fine in
 * Node.js — the tests import browser.ts directly.
 */
import t from 'tap';
import {
    safeRender,
    safeCompile,
    safeRenderAll,
    render,
    compile,
    renderAll,
} from './browser.ts';

// ---------------------------------------------------------------------------
// Trusted rendering (new Function path)
// ---------------------------------------------------------------------------

t.test('trusted render', t => {
    t.equal(render('hello world'), 'hello world');
    t.equal(render('hello ${name}', {name: 'world'}), 'hello world');
    t.equal(render('${a} + ${b} = ${a + b}', {a: 1, b: 2}), '1 + 2 = 3');
    t.end();
});

t.test('trusted compile', t => {
    const fn = compile('hi ${x}');
    t.equal(fn({x: 'there'}), 'hi there');
    t.equal(fn({x: 'again'}), 'hi again');
    t.end();
});

t.test('trusted renderAll', t => {
    t.same(renderAll({a: 'val:${x}', b: 42}, {x: 'ok'}), {a: 'val:ok', b: 42});
    t.same(renderAll(['${x}', '${y}'], {x: 'A', y: 'B'}), ['A', 'B']);
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — simple interpolation
// ---------------------------------------------------------------------------

t.test('safeRender — simple interpolation', t => {
    t.equal(safeRender('hello world'), 'hello world');
    t.equal(safeRender('hello ${name}', {name: 'world'}), 'hello world');
    t.equal(safeRender('${a} + ${b} = ${a + b}', {a: 1, b: 2}), '1 + 2 = 3');
    t.end();
});

t.test('safeRender — number and boolean vars', t => {
    t.equal(safeRender('count: ${n}', {n: 5}), 'count: 5');
    t.equal(safeRender('${flag}', {flag: true}), 'true');
    t.end();
});

t.test('safeRender — null / undefined vars are stringified', t => {
    t.equal(safeRender('${v}', {v: null}), 'null');
    t.equal(safeRender('${v}', {v: undefined}), 'undefined');
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — blong helpers
// ---------------------------------------------------------------------------

t.test('safeRender — blong.escapeHtml', t => {
    t.equal(
        safeRender('<div>${blong.escapeHtml(val)}</div>', {val: '<b>hello</b>'}),
        '<div>&lt;b&gt;hello&lt;/b&gt;</div>',
    );
    t.end();
});

t.test('safeRender — blong.escapeXml', t => {
    t.equal(
        safeRender('${blong.escapeXml(val)}', {val: '"hello"'}),
        '&quot;hello&quot;',
    );
    t.end();
});

t.test('safeRender — blong.join', t => {
    t.equal(safeRender('${blong.join(items, ", ")}', {items: ['a', 'b', 'c']}), 'a, b, c');
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — tagged template literals inside ${...}
// ---------------------------------------------------------------------------

t.test('safeRender — tagged template (blong.xml)', t => {
    t.equal(
        safeRender('${blong.xml`<tag>${val}</tag>`}', {val: '<b>'}),
        '<tag>&lt;b&gt;</tag>',
    );
    t.end();
});

t.test('safeRender — tagged template (blong.html)', t => {
    t.equal(
        safeRender('${blong.html`<p>${val}</p>`}', {val: '<b>'}),
        '<p>&lt;b&gt;</p>',
    );
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — operators
// ---------------------------------------------------------------------------

t.test('safeRender — ternary', t => {
    t.equal(safeRender('${x > 0 ? "pos" : "non-pos"}', {x: 1}), 'pos');
    t.equal(safeRender('${x > 0 ? "pos" : "non-pos"}', {x: -1}), 'non-pos');
    t.end();
});

t.test('safeRender — logical operators', t => {
    t.equal(safeRender('${a || b}', {a: '', b: 'fallback'}), 'fallback');
    t.equal(safeRender('${a ?? b}', {a: null, b: 'default'}), 'default');
    t.equal(safeRender('${a && b}', {a: 'yes', b: 'also'}), 'also');
    t.end();
});

t.test('safeRender — unary operators', t => {
    t.equal(safeRender('${!flag}', {flag: false}), 'true');
    t.equal(safeRender('${-n}', {n: 5}), '-5');
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — member access and method calls
// ---------------------------------------------------------------------------

t.test('safeRender — member access', t => {
    t.equal(safeRender('${obj.key}', {obj: {key: 'val'}}), 'val');
    t.equal(safeRender('${obj["key"]}', {obj: {key: 'val'}}), 'val');
    t.end();
});

t.test('safeRender — optional chaining', t => {
    t.equal(safeRender('${obj?.missing}', {obj: {}}), 'undefined');
    t.equal(safeRender('${obj?.key}', {obj: {key: 'hi'}}), 'hi');
    t.end();
});

t.test('safeRender — string method call', t => {
    t.equal(safeRender('${name.toUpperCase()}', {name: 'hello'}), 'HELLO');
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — arrays and objects
// ---------------------------------------------------------------------------

t.test('safeRender — array literal', t => {
    t.equal(safeRender('${[1,2,3].join("-")}', {}), '1-2-3');
    t.end();
});

t.test('safeRender — object literal member access', t => {
    t.equal(safeRender('${({a: 42}).a}', {}), '42');
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — typeof
// ---------------------------------------------------------------------------

t.test('safeRender — typeof unknown var returns "undefined"', t => {
    t.equal(safeRender('${typeof window}', {}), 'undefined');
    t.equal(safeRender('${typeof x}', {}), 'undefined');
    t.end();
});

t.test('safeRender — typeof known var', t => {
    t.equal(safeRender('${typeof n}', {n: 42}), 'number');
    t.end();
});

// ---------------------------------------------------------------------------
// Safe rendering — security: blocked globals
// ---------------------------------------------------------------------------

t.test('safeRender — unknown identifier throws', t => {
    t.throws(() => safeRender('${window}', {}), /undefined/);
    t.throws(() => safeRender('${document}', {}), /undefined/);
    t.throws(() => safeRender('${fetch}', {}), /undefined/);
    t.throws(() => safeRender('${process}', {}), /undefined/);
    t.throws(() => safeRender('${globalThis}', {}), /undefined/);
    t.end();
});

t.test('safeRender — blocked prototype properties', t => {
    t.throws(() => safeRender('${obj.constructor}', {obj: {}}), /undefined/);
    t.throws(() => safeRender('${obj.__proto__}', {obj: {}}), /undefined/);
    t.throws(() => safeRender('${obj.prototype}', {obj: {}}), /undefined/);
    t.end();
});

// ---------------------------------------------------------------------------
// safeCompile
// ---------------------------------------------------------------------------

t.test('safeCompile', t => {
    const fn = safeCompile('hi ${x}');
    t.equal(fn({x: 'there'}), 'hi there');
    t.equal(fn({x: 'again'}), 'hi again');
    t.throws(() => fn(), /undefined/);
    const fnLiteral = safeCompile('hi world');
    t.equal(fnLiteral(), 'hi world');
    t.end();
});

// ---------------------------------------------------------------------------
// safeRenderAll
// ---------------------------------------------------------------------------

t.test('safeRenderAll — nested object', t => {
    t.same(safeRenderAll({a: 'val:${x}', b: 42}, {x: 'ok'}), {a: 'val:ok', b: 42});
    t.end();
});

t.test('safeRenderAll — nested array', t => {
    t.same(safeRenderAll(['${x}', '${y}'], {x: 'A', y: 'B'}), ['A', 'B']);
    t.end();
});

t.test('safeRenderAll — deeply nested', t => {
    t.same(
        safeRenderAll({outer: {inner: '${v}'}}, {v: 'deep'}),
        {outer: {inner: 'deep'}},
    );
    t.end();
});

t.test('safeRenderAll — passthrough non-string', t => {
    t.same(safeRenderAll({n: 42, flag: true, nil: null}, {}), {n: 42, flag: true, nil: null});
    t.end();
});
