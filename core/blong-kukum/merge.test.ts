import t from 'tap';

import {
    appendChildFolder,
    appendDescribeBlock,
    appendStringEntry,
    appendYamlBlock,
    hasDescribeBlock,
    hasYamlKey,
    insertMapEntry,
} from './merge.ts';

/**
 * The merge helpers are what let `add` compose with a file that already holds
 * other entities. Each one recognises a single shape emitted by a kukum
 * template and gives up (`undefined`) when it does not find it, so a caller can
 * fall back to a plain overwrite and warn rather than corrupt the file.
 */

t.test('appendStringEntry adds to a list literal', t => {
    const source = "export default {integration: {watch: {test: ['test.widget']}}};";
    t.equal(
        appendStringEntry(source, 'test', 'test.gadget'),
        "export default {integration: {watch: {test: ['test.widget', 'test.gadget']}}};",
        'the neighbouring entry is kept',
    );
    t.equal(
        appendStringEntry('export default {watch: {test: []}};', 'test', 'test.gadget'),
        "export default {watch: {test: ['test.gadget']}};",
        'an empty list gains the entry',
    );
    t.equal(
        appendStringEntry(source, 'test', 'test.widget'),
        source,
        'idempotent: an existing entry is not duplicated',
    );
    t.equal(
        appendStringEntry('export default {watch: {}};', 'test', 'test.gadget'),
        undefined,
        'no list literal means the caller must fall back',
    );
    t.end();
});

t.test('insertMapEntry splices into an object literal', t => {
    const source = "tables: {'shop.order': 1}, procedurePaths: [],";
    t.equal(
        insertMapEntry(source, 'tables', 'shop.invoice', 2),
        "tables: {'shop.order': 1, 'shop.invoice': 2}, procedurePaths: [],",
        'the existing key survives',
    );
    t.equal(
        insertMapEntry('tables: {}, procedurePaths: [],', 'tables', 'shop.invoice', 2),
        "tables: {'shop.invoice': 2}, procedurePaths: [],",
        'an empty map gains the entry',
    );
    t.equal(
        insertMapEntry(source, 'tables', 'shop.order', 9),
        source,
        'idempotent: an existing key keeps its original order value',
    );
    t.equal(
        insertMapEntry('procedurePaths: [],', 'tables', 'shop.invoice', 2),
        undefined,
        'no map literal means the caller must fall back',
    );
    t.end();
});

t.test('appendYamlBlock keeps the document, and its comments, intact', t => {
    const source = '# a comment\nwidget:\n    - widgetId: 1\n';
    t.equal(hasYamlKey(source, 'widget'), true, 'an existing top-level key is detected');
    t.equal(hasYamlKey(source, 'gadget'), false, 'a missing key is detected');
    t.equal(
        appendYamlBlock(source, 'widget', 'gadget:\n    - gadgetId: 1\n'),
        source,
        'idempotent',
    );
    t.equal(
        appendYamlBlock(source, 'gadget', 'gadget:\n    - gadgetId: 1\n'),
        '# a comment\nwidget:\n    - widgetId: 1\ngadget:\n    - gadgetId: 1\n',
        'the new block is appended after the existing one',
    );
    t.end();
});

t.test('appendDescribeBlock keeps one block per entity', t => {
    const source = "test.describe('Widget', () => {});\n";
    t.equal(hasDescribeBlock(source, 'Widget'), true, 'an existing block is detected');
    t.equal(hasDescribeBlock(source, 'Gadget'), false, 'a missing block is detected');
    t.equal(
        appendDescribeBlock(source, 'Widget', "test.describe('Widget', () => {});"),
        source,
        'idempotent: the same entity is not described twice',
    );
    t.equal(
        appendDescribeBlock(source, 'Gadget', "test.describe('Gadget', () => {});"),
        "test.describe('Widget', () => {});\n\ntest.describe('Gadget', () => {});\n",
        'a second entity is appended',
    );
    t.end();
});

/** A realm `browser.ts` children declaration, in the shape the template writes it. */
const REALM_BROWSER = `export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob([
              './meta/model/**/*.ts',
              './browser/orchestrator/**/*.ts',
          ])
        : ['./meta/model', './browser/orchestrator'],
    config: {
        default: {meta: true},
    },
}));
`;

t.test('appendChildFolder adds a folder to both children lists', t => {
    const spliced = appendChildFolder(REALM_BROWSER, './meta/fixture');
    t.match(
        spliced ?? '',
        /\? import\.meta\.glob\(\[\n {14}'\.\/meta\/model\/\*\*\/\*\.ts',\n {14}'\.\/browser\/orchestrator\/\*\*\/\*\.ts',\n {14}'\.\/meta\/fixture\/\*\*\/\*\.ts',\n {10}\]\)/,
        'the glob list gains the pattern, one entry per line',
    );
    t.match(
        spliced ?? '',
        /: \['\.\/meta\/model', '\.\/browser\/orchestrator', '\.\/meta\/fixture'\]/,
        'the non-window list gains the directory',
    );
    t.equal(
        appendChildFolder(spliced ?? '', './meta/fixture'),
        spliced,
        'idempotent: a folder that is already listed is not added twice',
    );
    t.end();
});

t.test('appendChildFolder leaves arrays that are not children lists alone', t => {
    const source = "watch: {test: ['test.widget']};\nchildren: ['./meta', './browser'];\n";
    t.equal(
        appendChildFolder(source, './meta/fixture'),
        "watch: {test: ['test.widget']};\nchildren: ['./meta', './browser', './meta/fixture'];\n",
        'the array without a ./meta entry is untouched',
    );
    t.equal(
        appendChildFolder("children: ['./src', './browser'];\n", './meta/fixture'),
        undefined,
        'no ./meta list means the caller must tell the human',
    );
    t.end();
});
