import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';
import {readConfigFile} from './config.ts';

/**
 * The configuration document, and the difference between no document and a broken one.
 *
 * A deployment that names no file is a server on its defaults, which is ordinary. A file that is
 * there and does not parse is a generator and a server disagreeing about a policy, and the only
 * safe reading is to fail: a silent fallback would serve a page with a policy nobody wrote.
 */
test('no file is no configuration, and a document is read as it is', async t => {
    t.same(readConfigFile(), {}, 'a caller that names no file gets the defaults');
    const dir = mkdtempSync(join(tmpdir(), 'blong-asset-config-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    const file = join(dir, 'config.json');
    writeFileSync(file, JSON.stringify({base: '/ui/', cache: {html: 'no-store'}}));
    t.same(readConfigFile(file), {base: '/ui/', cache: {html: 'no-store'}}, 'the document is read');
    t.end();
});

test('a broken document fails loudly', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-asset-config-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));

    t.throws(
        () => readConfigFile(join(dir, 'absent.json')),
        /could not be read/,
        'a file that is not there is named rather than treated as empty',
    );

    const invalid = join(dir, 'invalid.json');
    writeFileSync(invalid, '{not json');
    t.throws(() => readConfigFile(invalid), /not valid JSON/);

    const list = join(dir, 'list.json');
    writeFileSync(list, '[]');
    t.throws(() => readConfigFile(list), /not a JSON object/);
    t.end();
});
