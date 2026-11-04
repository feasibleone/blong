import {test} from 'tap';
import {DEFAULT_CACHE_POLICY, cacheControlFor, defaultCachePolicy} from './cache.ts';

/**
 * Which file gets which lifetime.
 *
 * The three answers are one decision each, and the one that matters is the middle one: a name that
 * carries a content hash can be cached for as long as a browser honours it, because a new build
 * gives it a new name. A file that does not carry one cannot, and a shell that names the hashed
 * files must be revalidated or a deploy keeps pointing at files that no longer exist.
 */
test('a shell, a hashed file and a plain file get three lifetimes', async t => {
    t.equal(cacheControlFor('index.html'), DEFAULT_CACHE_POLICY.html, 'the shell is revalidated');
    t.equal(
        cacheControlFor('assets/app-12345678.js'),
        DEFAULT_CACHE_POLICY.immutable,
        'a hashed name is immutable',
    );
    t.equal(
        cacheControlFor('assets/main.8f2c1a9d.css'),
        DEFAULT_CACHE_POLICY.immutable,
        'and so is the other spelling a build emits',
    );
    t.equal(cacheControlFor('assets/plain.js'), DEFAULT_CACHE_POLICY.asset, 'a plain name is not');
    t.equal(cacheControlFor(''), DEFAULT_CACHE_POLICY.html, 'the root is the shell');
    t.end();
});

test('a configured policy wins, and a broken pattern fails safe', async t => {
    const policy = defaultCachePolicy({html: 'no-store', immutable: 'max-age=60'});
    t.equal(policy.html, 'no-store');
    t.equal(policy.immutable, 'max-age=60');
    t.equal(
        policy.asset,
        DEFAULT_CACHE_POLICY.asset,
        'the fields it did not name keep the default',
    );

    t.equal(
        cacheControlFor('assets/app-12345678.js', {immutablePattern: '('}),
        DEFAULT_CACHE_POLICY.asset,
        'a pattern that does not compile leaves the short policy rather than throwing',
    );
    t.end();
});
