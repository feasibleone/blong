/**
 * Unit tests for the config-validation helper.
 *
 * The property that matters is the allow-list: a key the component declared, a
 * child module or a framework key passes, and anything else is reported with a
 * path a reader can act on. Two exemptions are deliberate and asserted here —
 * a nested object is left open and a `required` is not enforced, because the
 * declared schemas are partial.
 */
import {test} from 'tap';
import {Type} from 'typebox';

import {composeConfigSchema, formatConfigIssues, validateConfigBlock} from './configValidation.ts';

const declared = Type.Object({
    connection: Type.Object({
        host: Type.String(),
        port: Type.Number(),
    }),
    logLevel: Type.Optional(Type.String()),
});

test('a declared key passes', async t => {
    t.same(
        validateConfigBlock({connection: {host: 'db', port: 5432}, logLevel: 'debug'}, declared, [
            'server',
        ]),
        [],
        'no issues',
    );
});

test('a child module key passes, though the schema does not name it', async t => {
    t.same(
        validateConfigBlock({connection: {host: 'db', port: 5432}, server: true}, declared, [
            'server',
        ]),
        [],
        'a child key is structural, not declared',
    );
});

test('a framework key passes, though the schema does not name it', async t => {
    t.same(
        validateConfigBlock(
            {connection: {host: 'db', port: 5432}, watch: {enabled: true}, gateway: {port: 0}},
            declared,
            [],
        ),
        [],
        'log/watch/gateway and the rest are always allowed',
    );
});

test('an unknown top-level key is reported with its path', async t => {
    const issues = validateConfigBlock(
        {connection: {host: 'db', port: 5432}, outputDir: 'system/kustomize'},
        declared,
        [],
    );
    t.equal(issues.length, 1, 'one issue');
    t.equal(issues[0].path, '(root)', 'reported at the block');
    t.match(issues[0].message, /unknown key 'outputDir'/, 'names the key');
    t.match(
        issues[0].message,
        /matching no child, port or framework key/,
        'says why it is unknown',
    );
});

test('a nested unknown key is left alone, because the schemas are partial', async t => {
    t.same(
        validateConfigBlock({connection: {host: 'db', port: 5432, ssl: true}}, declared, []),
        [],
        'nested objects are open',
    );
});

test('a type mismatch is explained with the expected type and the value found', async t => {
    const issues = validateConfigBlock({connection: {host: 42, port: 5432}}, declared, []);
    t.equal(issues.length, 1, 'one issue');
    t.equal(issues[0].path, 'connection.host', 'names the leaf');
    t.match(issues[0].message, /expected string, found 42/, 'expected and actual');
});

test('a missing required key is not enforced, because the schemas are partial', async t => {
    t.same(
        validateConfigBlock({connection: {host: 'db'}}, declared, []),
        [],
        'a schema that requires more than the config sets does not fail',
    );
});

test('an unknown key fails even with no declared schema', async t => {
    const issues = validateConfigBlock({anything: {at: 'all'}}, undefined, ['server']);
    t.equal(issues.length, 1, 'the unknown key is reported');
    t.match(issues[0].message, /unknown key 'anything'/, 'named');
});

test('a key the source config names is allowed even with no schema', async t => {
    t.same(
        validateConfigBlock({db: {password: {}}, k8s: {k8sRealmRole: 'both'}}, undefined, [
            'db',
            'k8s',
        ]),
        [],
        'access-style realm keys are legitimate',
    );
});

test('a schema that allows extra keys keeps them', async t => {
    const open = {...Type.Object({known: Type.String()}), additionalProperties: true};
    t.same(
        validateConfigBlock({known: 'x', extra: 1}, open, []),
        [],
        'additionalProperties: true is respected',
    );
});

test('composeConfigSchema adds allowed and framework keys as unknown-typed placeholders', async t => {
    const schema = composeConfigSchema(Type.Object({own: Type.String()}), ['child']);
    t.ok(schema.properties['child'], 'child allowed');
    t.ok(schema.properties['log'], 'framework key allowed');
    t.ok(schema.properties['own'], 'declared key kept');
    t.equal(
        (schema as {additionalProperties?: unknown}).additionalProperties,
        false,
        'sealed at the top level',
    );
});

test('a framework key shadows a declared prop of the same name', async t => {
    // `adapter` declares `server: Boolean()`, while the loader puts the platform
    // block under `server` in every module; the platform block is what arrives.
    const schema = composeConfigSchema(Type.Object({server: Type.Boolean()}), []);
    t.not(
        (schema.properties['server'] as {type?: string}).type,
        'boolean',
        'the declared type is replaced',
    );
});

test('onlyUnknownKeys narrows the unknown-key check without hiding a type error', async t => {
    // The root case: an rc file's `utBus` is the developer's, an argv `typo` is
    // not. A declared schema still reports its type errors.
    const issues = validateConfigBlock(
        {utBus: {port: 1}, typo: true, connection: {host: 42, port: 5432}},
        declared,
        [],
        {onlyUnknownKeys: new Set(['typo'])},
    );
    t.ok(
        issues.some(issue => /unknown key 'typo'/.test(issue.message)),
        'the command-line key is reported',
    );
    t.ok(
        issues.some(issue => /expected string, found 42/.test(issue.message)),
        'the type error survives the narrowing',
    );
    t.notOk(
        issues.some(issue => /utBus/.test(issue.message)),
        'the rc key is ignored',
    );
});

test('formatConfigIssues renders one line per issue under a named component', async t => {
    const text = formatConfigIssues('kustomize', [
        {path: '(root)', message: "unknown key 'outputDir'"},
        {path: 'db.host', message: 'expected string, found 42'},
    ]);
    t.match(text, /Invalid configuration for kustomize:/, 'names the component');
    t.match(text, /\n {2}\(root\): unknown key 'outputDir'/, 'one line per issue');
    t.match(text, /\n {2}db\.host: expected string, found 42/, 'one line per issue');
});
