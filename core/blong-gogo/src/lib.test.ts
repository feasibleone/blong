/**
 * Unit tests for lib.ts utilities — parseAnnotatedKey and camelToSentence.
 *
 * These functions drive the annotation syntax and sub-property destructuring
 * naming features of the handler proxy (layerProxy.ts):
 *
 *  - `parseAnnotatedKey("@name bill payment testFn")`
 *      → Mode A: injects `$meta.name = "bill payment"` on testFn
 *  - `parseAnnotatedKey("@cache ttl=10 testFn")`
 *      → Mode B: merges config.handler.cache into $meta, then sets cache.ttl = "10"
 *  - `camelToSentence("bulkOrder")`
 *      → Returns "bulk order" — used for $meta.name in sub-property destructuring
 */

import {test} from 'tap';

import {camelToSentence, methodParts, parseAnnotatedKey} from './lib.ts';

// ---------------------------------------------------------------------------
// methodParts — the name a handler is registered and dispatched under
// ---------------------------------------------------------------------------

test('methodParts splits the leading word group', async t => {
    t.equal(methodParts('clusterPodFind'), 'cluster.pod.find');
    t.equal(methodParts('partyAclFixtureGet'), 'party.acl.fixtureGet', 'the third part may go on');
    t.equal(methodParts('access.role.merge'), 'access.role.merge', 'a wire name passes through');
});

test('a separator joins the words of one part and stays in the name', async t => {
    // The four spellings a caller may reach for, and the two names they resolve to. `-` and `_`
    // are kept as they were written, because the separator is what says the words are one part.
    t.equal(methodParts('clusterToken_ReviewCreate'), 'cluster.token_review.create');
    t.equal(methodParts('clusterToken-ReviewCreate'), 'cluster.token-review.create');
    t.equal(methodParts('clusterToken_reviewCreate'), 'cluster.token_review.create');
    t.equal(methodParts('clusterToken-reviewCreate'), 'cluster.token-review.create');
});

test('a compound part keeps every word it was written with', async t => {
    t.equal(
        methodParts('clusterPersistent_Volume_ClaimApply'),
        'cluster.persistent_volume_claim.apply',
        'the whole kind stays the middle part',
    );
    t.equal(
        methodParts('clusterToken_ReviewCreate'),
        'cluster.token_review.create',
        'and a two-word kind does too',
    );
});

test('a name with no separator is unchanged by the join', async t => {
    t.equal(
        methodParts('clusterPersistentVolumeClaimApply'),
        'cluster.persistent.volumeClaimApply',
        'which is why a compound kind has to carry the separator (F-379)',
    );
});

test('methodParts keeps the `$` template behaviour', async t => {
    t.equal(methodParts('$subject$ObjectMerge'), '$subject.$object.merge');
    t.equal(methodParts('$subjectFixture'), '$subject.fixture');
});

// ---------------------------------------------------------------------------
// parseAnnotatedKey — valid inputs
// ---------------------------------------------------------------------------

test('parseAnnotatedKey — single annotation with params (Mode A)', async t => {
    const result = parseAnnotatedKey('@name bill payment testFn');
    t.equal(result.handlerName, 'testFn');
    t.equal(result.annotations.length, 1);
    t.equal(result.annotations[0].name, 'name');
    t.same(result.annotations[0].params, ['bill', 'payment']);
});

test('parseAnnotatedKey — annotation with key=value params (Mode B)', async t => {
    const result = parseAnnotatedKey('@cache ttl=10 testFn');
    t.equal(result.handlerName, 'testFn');
    t.equal(result.annotations.length, 1);
    t.equal(result.annotations[0].name, 'cache');
    t.same(result.annotations[0].params, ['ttl=10']);
});

test('parseAnnotatedKey — annotation with no params (Mode B, no overrides)', async t => {
    const result = parseAnnotatedKey('@cache testFn');
    t.equal(result.handlerName, 'testFn');
    t.equal(result.annotations.length, 1);
    t.equal(result.annotations[0].name, 'cache');
    t.same(result.annotations[0].params, []);
});

test('parseAnnotatedKey — multiple annotations stack correctly', async t => {
    const result = parseAnnotatedKey('@name bill payment @timeout 5000 testFn');
    t.equal(result.handlerName, 'testFn');
    t.equal(result.annotations.length, 2);
    t.equal(result.annotations[0].name, 'name');
    t.same(result.annotations[0].params, ['bill', 'payment']);
    t.equal(result.annotations[1].name, 'timeout');
    t.same(result.annotations[1].params, ['5000']);
});

test('parseAnnotatedKey — no annotations, handler name only', async t => {
    const result = parseAnnotatedKey('testFn');
    t.equal(result.handlerName, 'testFn');
    t.equal(result.annotations.length, 0);
});

test('parseAnnotatedKey — trims extra whitespace', async t => {
    const result = parseAnnotatedKey('  @name foo  testFn  ');
    t.equal(result.handlerName, 'testFn');
    t.equal(result.annotations.length, 1);
    t.same(result.annotations[0].params, ['foo']);
});

// ---------------------------------------------------------------------------
// parseAnnotatedKey — malformed inputs throw
// ---------------------------------------------------------------------------

test('parseAnnotatedKey — throws when key is empty', async t => {
    t.throws(() => parseAnnotatedKey(''), /Malformed annotated key/);
});

test('parseAnnotatedKey — throws when last token starts with @', async t => {
    t.throws(() => parseAnnotatedKey('@name @cache'), /Malformed annotated key/);
});

test('parseAnnotatedKey — throws when only whitespace', async t => {
    t.throws(() => parseAnnotatedKey('   '), /Malformed annotated key/);
});

// ---------------------------------------------------------------------------
// camelToSentence — used for sub-property destructuring name injection
// ---------------------------------------------------------------------------

test('camelToSentence — converts camelCase to sentence', async t => {
    t.equal(camelToSentence('bulkOrder'), 'bulk order');
    t.equal(camelToSentence('billPayment'), 'bill payment');
    t.equal(camelToSentence('orderOrderCreate'), 'order order create');
});

test('camelToSentence — leaves lowercase unchanged', async t => {
    t.equal(camelToSentence('order'), 'order');
});

test('camelToSentence — handles consecutive capitals (e.g. acronyms)', async t => {
    t.equal(camelToSentence('parseXMLDocument'), 'parse xml document');
});
