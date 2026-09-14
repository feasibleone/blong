import t from 'tap';
import {EmbeddingCache} from './embedding.ts';
import {createProvider} from './provider.ts';

t.test('the provider is called once per distinct fingerprint, never per record (PRD R3)', async t => {
    let calls = 0;
    const provider = createProvider({kind: 'offline', dimension: 16});
    const counting = {
        dimension: provider.dimension,
        embed: async (text: string): Promise<number[]> => {
            calls++;
            return provider.embed(text);
        },
    };
    const cache = new EmbeddingCache(counting);
    const first = await cache.vectorFor('fp-a', 'signature a');
    const again = await cache.vectorFor('fp-a', 'signature a');
    const other = await cache.vectorFor('fp-b', 'signature b');
    t.equal(calls, 2, 'PRD R3 acceptance and SC3');
    t.same(first, again, 'cache returns the identical vector');
    t.notSame(first, other);
    t.equal(cache.calls(), 2);
    t.end();
});

t.test('concurrent first arrivals for one fingerprint share a single provider call (PRD R3)', async t => {
    // The sequential test above only pins the property when the calls do not
    // overlap. A fastify service serves concurrent requests, and the cache is
    // check-then-act, so without memoising the in-flight computation two
    // simultaneous first arrivals would both miss and both embed.
    let calls = 0;
    const provider = createProvider({kind: 'offline', dimension: 8});
    const cache = new EmbeddingCache({
        dimension: provider.dimension,
        embed: async (text: string): Promise<number[]> => {
            calls++;
            return provider.embed(text);
        },
    });
    const [first, second] = await Promise.all([
        cache.vectorFor('fp-shared', 'signature'),
        cache.vectorFor('fp-shared', 'signature'),
    ]);
    t.equal(calls, 1, 'the two concurrent first arrivals consult the provider once');
    t.equal(cache.calls(), 1, 'and the call counter agrees');
    t.same(first, second, 'both callers receive an equal vector');
    t.equal(cache.size(), 1, 'one distinct fingerprint means one stored vector');
});

t.test('the cache copies on read and on store, so every caller owns its vector', async t => {
    // Task 2 ruled the registry must copy on store precisely because this
    // cache's array reaches it; this pins the cache's own half. It is the
    // producer of that alias, so it must not retain the provider's array nor
    // hand out the array it retains.
    const providerVector = [0.1, 0.2, 0.3];
    const cache = new EmbeddingCache({dimension: 3, embed: async () => providerVector});
    const first = await cache.vectorFor('fp-own', 'signature');
    t.same(first, [0.1, 0.2, 0.3], 'the provider vector is returned');

    first[0] = 99; // the caller owns `first` and may mutate it freely
    providerVector[1] = 99; // and the provider's own array must not be the stored one

    const second = await cache.vectorFor('fp-own', 'signature');
    t.same(second, [0.1, 0.2, 0.3], 'neither the caller mutation nor the provider mutation reached the store');
    t.ok(first !== second, 'each read hands out a distinct array');
    t.same(await cache.vectorFor('fp-own', 'signature'), [0.1, 0.2, 0.3], 'a further read is unaffected');
});

t.test('a failing provider does not poison the cache', async t => {
    let attempts = 0;
    const cache = new EmbeddingCache({
        dimension: 4,
        embed: async () => {
            attempts++;
            if (attempts === 1) throw new Error('transient');
            return [1, 0, 0, 0];
        },
    });
    await t.rejects(cache.vectorFor('fp', 'text'), /transient/);
    t.same(await cache.vectorFor('fp', 'text'), [1, 0, 0, 0], 'the retry is not answered from a bad cache entry');
    t.end();
});

t.test('the cache reports what it holds, and counts only real provider calls', async t => {
    const cache = new EmbeddingCache({dimension: 2, embed: async () => [1, 0]});
    t.equal(cache.size(), 0, 'a fresh cache holds no vectors');
    t.equal(cache.calls(), 0, 'and has consulted nothing');
    await cache.vectorFor('fp-only', 'signature');
    t.equal(cache.size(), 1, 'one distinct fingerprint means one stored vector');
    t.equal(cache.calls(), 1, 'and exactly one provider call');
    await cache.vectorFor('fp-only', 'signature');
    t.equal(cache.size(), 1, 'a repeat fingerprint adds nothing');
    t.equal(cache.calls(), 1, 'and is answered without the provider (PRD R3)');
    t.end();
});
