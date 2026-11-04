import {test} from 'tap';
import {normalizeBase, resolveRelativePath, toFileSystemPath} from './paths.ts';

/**
 * The traversal guard, on its own.
 *
 * A static server's whole risk is a URL that names a file outside the directory it was given, so the
 * spellings are pinned here rather than only through the server: one test per way a URL can say
 * "up", and the ordinary shapes beside them so the guard is not simply refusing everything.
 */
test('the base is one spelling', async t => {
    t.equal(normalizeBase('/s'), '/s/', 'a prefix gains its trailing slash');
    t.equal(normalizeBase('/s/'), '/s/', 'and one that has it is left alone');
    t.equal(normalizeBase('s'), '/s/', 'a missing leading slash is added');
    t.equal(normalizeBase(''), '/', 'an empty prefix is the root');
    t.end();
});

test('a request resolves under the base', async t => {
    t.same(resolveRelativePath('/s/', '/s/index.html'), {
        relativePath: 'index.html',
        directory: false,
    });
    t.same(resolveRelativePath('/s/', '/s/assets/app-12345678.js'), {
        relativePath: 'assets/app-12345678.js',
        directory: false,
    });
    t.same(resolveRelativePath('/s/', '/s/'), {relativePath: '', directory: true});
    t.same(resolveRelativePath('/s/', '/s/deep/'), {
        relativePath: 'deep',
        directory: true,
    });
    t.same(resolveRelativePath('/s/', '/s?x=1'), {relativePath: '', directory: true});
    t.equal(
        resolveRelativePath('/s/', '/other/index.html'),
        undefined,
        'a path outside the base is not this server’s',
    );
    t.end();
});

test('a path that climbs out is refused, however it is spelled', async t => {
    for (const url of [
        '/s/../secret',
        '/s/../../etc/passwd',
        '/s/%2e%2e/secret',
        '/s/%2E%2E/%2E%2E/etc/passwd',
        '/s/..%2fsecret',
        '/s/deep/../../secret',
        '/s/%252e%252e/secret',
        '/s/..\\secret',
        '/s/%00index.html',
    ]) {
        t.equal(resolveRelativePath('/s/', url), undefined, `${url} is refused`);
    }
    t.equal(
        resolveRelativePath('/s/', '/s/%zz'),
        undefined,
        'a malformed escape is refused rather than thrown',
    );
    t.end();
});

test('the filesystem path stays under the root', async t => {
    t.equal(toFileSystemPath('/bundle', 'assets/app.js'), '/bundle/assets/app.js');
    t.equal(toFileSystemPath('/bundle', ''), '/bundle', 'the base itself is the root');
    t.equal(
        toFileSystemPath('/bundle', '../secret'),
        undefined,
        'a join that leaves the root has no answer',
    );
    t.end();
});
