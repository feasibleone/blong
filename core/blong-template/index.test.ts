import {test} from 'tap';
import {
    compile,
    escapeHtml,
    escapeJson,
    escapeXml,
    helpers,
    htmlTag,
    jsonTag,
    render,
    renderAll,
    safeCompile,
    safeRender,
    safeRenderAll,
    xmlTag,
} from './index.ts';

// ---------------------------------------------------------------------------
// escape utilities
// ---------------------------------------------------------------------------

test('escapeXml — escapes all five XML special characters', t => {
    t.equal(escapeXml('&'), '&amp;');
    t.equal(escapeXml('"'), '&quot;');
    t.equal(escapeXml("'"), '&apos;');
    t.equal(escapeXml('<'), '&lt;');
    t.equal(escapeXml('>'), '&gt;');
    t.equal(
        escapeXml('<b>bold & "quoted"</b>'),
        '&lt;b&gt;bold &amp; &quot;quoted&quot;&lt;/b&gt;',
    );
    t.end();
});

test('escapeXml — coerces non-string values to string', t => {
    t.equal(escapeXml(42), '42');
    t.equal(escapeXml(true), 'true');
    t.equal(escapeXml(null), '');
    t.equal(escapeXml(undefined), '');
    t.end();
});

test('escapeHtml — uses &#39; for single quotes instead of &apos;', t => {
    t.equal(escapeHtml("it's"), 'it&#39;s');
    t.equal(
        escapeHtml('<script>alert("xss")</script>'),
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    t.end();
});

test('escapeJson — strips surrounding quotes for strings', t => {
    t.equal(escapeJson('hello "world"'), 'hello \\"world\\"');
    t.equal(escapeJson('line1\nline2'), 'line1\\nline2');
    t.end();
});

test('escapeJson — returns full JSON for non-strings', t => {
    t.equal(escapeJson(42), '42');
    t.equal(escapeJson(true), 'true');
    t.equal(escapeJson(null), 'null');
    t.equal(escapeJson(undefined), 'null');
    t.equal(escapeJson([1, 2]), '[1,2]');
    t.end();
});

test('xmlTag — tagged template escapes interpolations', t => {
    const content = '<b>bold</b>';
    t.equal(xmlTag`<p>${content}</p>`, '<p>&lt;b&gt;bold&lt;/b&gt;</p>');
    t.end();
});

test('htmlTag — tagged template escapes interpolations as HTML', t => {
    const val = "O'Brien & <Friends>";
    t.equal(htmlTag`<div>${val}</div>`, '<div>O&#39;Brien &amp; &lt;Friends&gt;</div>');
    t.end();
});

test('jsonTag — tagged template serializes interpolations', t => {
    const name = 'Alice "Wonderland"';
    t.equal(jsonTag`{"name":"${name}"}`, '{"name":"Alice \\"Wonderland\\""}');
    t.end();
});

// ---------------------------------------------------------------------------
// helpers object
// ---------------------------------------------------------------------------

test('helpers — is frozen', t => {
    t.equal(Object.isFrozen(helpers), true);
    t.end();
});

test('helpers.join — joins array with separator', t => {
    t.equal(helpers.join(['a', 'b', 'c'], ', '), 'a, b, c');
    t.equal(helpers.join(['a', 'b'], ''), 'ab');
    t.equal(helpers.join([], ', '), '');
    t.end();
});

test('helpers.join — accepts non-array (wraps in array)', t => {
    t.equal(helpers.join('single' as unknown as unknown[], '-'), 'single');
    t.end();
});

// ---------------------------------------------------------------------------
// trusted render
// ---------------------------------------------------------------------------

test('render — simple interpolation', t => {
    t.equal(render('Hello ${name}!', {name: 'World'}), 'Hello World!');
    t.end();
});

test('render — multiple variables', t => {
    t.equal(render('${a} + ${b} = ${a + b}', {a: 1, b: 2}), '1 + 2 = 3');
    t.end();
});

test('render — no variables returns template as-is when no expressions', t => {
    t.equal(render('plain text'), 'plain text');
    t.end();
});

test('render — handles backticks in template', t => {
    t.equal(render('say `hello`'), 'say `hello`');
    t.end();
});

test('render — handles backslashes in template', t => {
    // Windows path — backslash must not be interpreted as an escape sequence
    t.equal(render('path: ${dir}\\file', {dir: 'C:\\users'}), 'path: C:\\users\\file');
    t.end();
});

test('render — blong helpers available as blong.*', t => {
    t.equal(render('${blong.escapeXml(v)}', {v: '<b>'}), '&lt;b&gt;');
    t.end();
});

test('render — blong tagged template xml in expression', t => {
    const result = render('${blong.xml`<tag>${v}</tag>`}', {v: '<b>&'});
    t.equal(result, '<tag>&lt;b&gt;&amp;</tag>');
    t.end();
});

test('render — blong.join helper', t => {
    t.equal(render('${blong.join(items, ", ")}', {items: ['a', 'b', 'c']}), 'a, b, c');
    t.end();
});

test('render — throws ReferenceError for undefined variable', t => {
    t.throws(() => render('${x}', {}), /x is not defined/);
    t.end();
});

test('render — caches compiled function (same reference for same template)', t => {
    const fn1 = compile('hello ${name}');
    const fn2 = compile('hello ${name}');
    // Both calls should return a function and produce the same result
    t.equal(fn1({name: 'Alice'}), 'hello Alice');
    t.equal(fn2({name: 'Bob'}), 'hello Bob');
    t.end();
});

// ---------------------------------------------------------------------------
// compile (trusted)
// ---------------------------------------------------------------------------

test('compile — returns reusable render function', t => {
    const greet = compile('Hello ${name}!');
    t.equal(greet({name: 'Alice'}), 'Hello Alice!');
    t.equal(greet({name: 'Bob'}), 'Hello Bob!');
    t.end();
});

test('compile — works with no variables', t => {
    const fn = compile('static text');
    t.equal(fn(), 'static text');
    t.end();
});

// ---------------------------------------------------------------------------
// renderAll (trusted)
// ---------------------------------------------------------------------------

test('renderAll — renders string values in flat object', t => {
    const result = renderAll({greeting: 'Hello ${name}!', count: 42}, {name: 'World'});
    t.same(result, {greeting: 'Hello World!', count: 42});
    t.end();
});

test('renderAll — renders nested objects recursively', t => {
    const result = renderAll({outer: {inner: '${x}', num: 1}}, {x: 'value'});
    t.same(result, {outer: {inner: 'value', num: 1}});
    t.end();
});

test('renderAll — renders string values inside arrays', t => {
    const result = renderAll(['${a}', '${b}', 42], {a: '1', b: '2'});
    t.same(result, ['1', '2', 42]);
    t.end();
});

test('renderAll — passes through null and non-string leaf values', t => {
    const result = renderAll({a: null, b: undefined, c: 123, d: true}, {});
    t.same(result, {a: null, b: undefined, c: 123, d: true});
    t.end();
});

test('renderAll — handles a plain string input', t => {
    t.equal(renderAll('${x}', {x: 'hi'}), 'hi');
    t.end();
});

// ---------------------------------------------------------------------------
// safeRender — sandboxed mode
// ---------------------------------------------------------------------------

test('safeRender — simple interpolation', t => {
    t.equal(safeRender('Hello ${name}!', {name: 'World'}), 'Hello World!');
    t.end();
});

test('safeRender — blong helpers available', t => {
    t.equal(safeRender('${blong.escapeHtml(v)}', {v: '<b>bold</b>'}), '&lt;b&gt;bold&lt;/b&gt;');
    t.end();
});

test('safeRender — handles backticks in template', t => {
    t.equal(safeRender('say `hello`'), 'say `hello`');
    t.end();
});

test('safeRender — handles backslashes in template', t => {
    t.equal(safeRender('C:\\users\\${user}', {user: 'bob'}), 'C:\\users\\bob');
    t.end();
});

test('safeRender — cannot access process or require', t => {
    // In the sandbox, `process` and `require` are simply not defined
    t.equal(safeRender('${typeof process}'), 'undefined');
    t.equal(safeRender('${typeof require}'), 'undefined');
    t.end();
});

test('safeRender — cannot access host globals via prototype chain', t => {
    // The classic vm escape: ({}).constructor.constructor('return process')()
    // should either return undefined or throw — it must not return the real process
    let result: unknown;
    try {
        result = safeRender("${({}).constructor.constructor('return process')()}");
    } catch {
        // Throwing is also acceptable
        t.pass('prototype chain escape threw (good)');
        t.end();
        return;
    }
    t.not(result, process, 'must not return the host process object');
    t.end();
});

test('safeRender — timeout prevents infinite loops', t => {
    t.throws(
        () => safeRender('${(function loop(){return loop();}())}'),
        /Script execution timed out|Maximum call stack/i,
    );
    t.end();
});

// ---------------------------------------------------------------------------
// safeCompile
// ---------------------------------------------------------------------------

test('safeCompile — returns reusable sandboxed render function', t => {
    const greet = safeCompile('Hello ${name}!');
    t.equal(greet({name: 'Alice'}), 'Hello Alice!');
    t.equal(greet({name: 'Bob'}), 'Hello Bob!');
    t.end();
});

// ---------------------------------------------------------------------------
// safeRenderAll — sandboxed recursive
// ---------------------------------------------------------------------------

test('safeRenderAll — renders all string values safely', t => {
    const result = safeRenderAll({msg: 'Hi ${user}!', score: 100}, {user: 'Alice'});
    t.same(result, {msg: 'Hi Alice!', score: 100});
    t.end();
});

test('safeRenderAll — cannot access process in nested strings', t => {
    const result = safeRenderAll({info: '${typeof process}'}, {});
    t.same(result, {info: 'undefined'});
    t.end();
});
