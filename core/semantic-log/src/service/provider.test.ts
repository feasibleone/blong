import t from 'tap';
import {createProvider, hashEmbedding} from './provider.ts';

t.test('hashEmbedding is deterministic, bounded and dimension-stable', t => {
    const a = hashEmbedding('some structural text', 64);
    const b = hashEmbedding('some structural text', 64);
    t.same(a, b);
    t.equal(a.length, 64);
    t.ok(a.every(value => value >= -1 && value <= 1));
    t.notSame(hashEmbedding('different text', 64), a);
    t.end();
});

t.test('hashEmbedding is normalized, so a dot product is a cosine similarity', t => {
    const vector = hashEmbedding('normalized', 64);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    t.ok(Math.abs(norm - 1) < 1e-9, `norm was ${norm}`);
    t.end();
});

t.test('hashEmbedding stops mid-digest when the width is not a block multiple', t => {
    // A sha256 digest yields 16 components, so a width like 64 or 32 always
    // finishes a block exactly. 7 does not: the generator has to stop on the
    // requested width rather than on the digest, which is the branch a
    // block-aligned width can never reach.
    const vector = hashEmbedding('ragged width', 7);
    t.equal(vector.length, 7);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    t.ok(Math.abs(norm - 1) < 1e-9, `norm was ${norm}`);
    t.end();
});

t.test('the offline provider needs no configuration and no network', async t => {
    const provider = createProvider({kind: 'offline', dimension: 32});
    t.equal(provider.dimension, 32);
    t.equal((await provider.embed('anything')).length, 32);
});

t.test('the remote provider posts to an OpenAI-compatible endpoint', async t => {
    const calls: Array<{url: string; body: unknown}> = [];
    const fakeFetch = async (url: string, init: {body: string}): Promise<{ok: boolean; json: () => Promise<unknown>}> => {
        calls.push({url, body: JSON.parse(init.body)});
        return {ok: true, json: async () => ({data: [{embedding: [0.1, 0.2, 0.3]}]})};
    };
    const provider = createProvider({
        kind: 'remote',
        url: 'https://example.test/v1/embeddings',
        model: 'test-model',
        apiKey: 'k',
        fetch: fakeFetch as unknown as typeof fetch,
    });
    t.same(await provider.embed('hello'), [0.1, 0.2, 0.3]);
    t.equal(calls[0].url, 'https://example.test/v1/embeddings');
    t.same(calls[0].body, {input: 'hello', model: 'test-model'});
});

t.test('a failing remote provider raises, rather than returning a fake vector', async t => {
    const provider = createProvider({
        kind: 'remote',
        url: 'https://example.test/v1/embeddings',
        model: 'm',
        fetch: (async () => ({ok: false, status: 500, statusText: 'boom'})) as unknown as typeof fetch,
    });
    await t.rejects(provider.embed('x'), /embedding provider failed: 500 boom/);
});

t.test('an unusable remote configuration is refused before any call is made', t => {
    t.throws(
        () => createProvider({kind: 'remote'}),
        /remote embedding requires url and model/,
        'a url is required',
    );
    t.throws(
        () => createProvider({kind: 'remote', url: 'https://example.test/v1/embeddings'}),
        /remote embedding requires url and model/,
        'a model is required alongside the url, because the endpoint has no default',
    );
    t.end();
});

t.test('an unknown kind is refused, naming the offending value', t => {
    // The union stops literal callers, so the cast is not a way around the type
    // system here: `kind` reaches `createProvider` from untyped, JSON-sourced
    // configuration, which is the entry point this pins. Without the explicit
    // rejection an unknown value silently selects the local provider and fails
    // later with a misleading missing-package error.
    const unknown = {kind: 'onnx'} as unknown as Parameters<typeof createProvider>[0];
    t.throws(() => createProvider(unknown), /unknown embedding kind 'onnx'/, 'the error names the value');
    t.end();
});

t.test('the providers carry their documented default widths', t => {
    t.equal(createProvider({kind: 'offline'}).dimension, 64, 'the offline default width');
    t.equal(
        createProvider({kind: 'remote', url: 'https://example.test/v1/embeddings', model: 'm'}).dimension,
        1536,
        'the OpenAI-compatible default width, when the endpoint does not say',
    );
    t.equal(
        createProvider({kind: 'remote', url: 'https://example.test/v1/embeddings', model: 'm', dimension: 12}).dimension,
        12,
        'a configured width wins over the default, and the global fetch is the fallback client',
    );
    t.end();
});

t.test('a remote response without a vector is an error, not an empty embedding', async t => {
    const respondWith = (json: unknown) =>
        createProvider({
            kind: 'remote',
            url: 'https://example.test/v1/embeddings',
            model: 'm',
            fetch: (async () => ({ok: true, json: async () => json})) as unknown as typeof fetch,
        });
    await t.rejects(respondWith({}).embed('x'), /embedding provider returned no vector/, 'no data field at all');
    await t.rejects(respondWith({data: []}).embed('x'), /embedding provider returned no vector/, 'data with no entry');
});

t.test('the local provider is testable through an injected module loader', async t => {
    // Ruling: the ONNX path must not be a placeholder. The loader is injected
    // (`EmbeddingConfig.loadTransformers`) so the mapping from a Float32Array
    // to a plain vector is asserted here, with no model, no download and no
    // network — the same reason `fetch` is injectable on the remote provider.
    const loads: Array<{task: string; model: string}> = [];
    let extracts = 0;
    const provider = createProvider({
        kind: 'local',
        dimension: 3,
        loadTransformers: async () => {
            const fake = {
                pipeline: async (
                    task: string,
                    model: string,
                ): Promise<(input: string, options: {pooling: string; normalize: boolean}) => Promise<{data: Float32Array}>> => {
                    loads.push({task, model});
                    return async (
                        input: string,
                        options: {pooling: string; normalize: boolean},
                    ): Promise<{data: Float32Array}> => {
                        extracts++;
                        t.equal(input, 'a signature', 'the extractor receives the signature text');
                        t.same(
                            options,
                            {pooling: 'mean', normalize: true},
                            'mean pooling and normalisation are requested, so vectors are comparable',
                        );
                        return {data: new Float32Array([0.5, -0.25, 0.125])};
                    };
                },
            };
            return fake;
        },
    });
    t.equal(provider.dimension, 3, 'an explicit width is honoured');
    t.same(loads, [], 'constructing a local provider imports nothing: the module loads lazily');
    t.same(await provider.embed('a signature'), [0.5, -0.25, 0.125], 'the Float32Array becomes a plain number[]');
    t.same(await provider.embed('a signature'), [0.5, -0.25, 0.125], 'the loaded extractor answers the second call');
    t.equal(loads.length, 1, 'the module is imported once, not once per embed');
    t.equal(extracts, 2, 'the extractor itself still runs per embed');
    t.same(loads, [{task: 'feature-extraction', model: 'Xenova/all-MiniLM-L6-v2'}], 'the documented task and model');
});

t.test('the local default width needs no model present', t => {
    t.equal(createProvider({kind: 'local'}).dimension, 384, 'the ONNX default width');
    t.end();
});

t.test('a loader that cannot resolve is reported as an actionable error, not a crash', async t => {
    // The optional package is deliberately not a dependency (it is heavy, and
    // adopting it is a plan-level decision), so the absent-package path is
    // tested behaviour: the failure names the package and keeps the resolution
    // error as its cause.
    const missing = Object.assign(new Error("Cannot find package '@huggingface/transformers'"), {
        code: 'ERR_MODULE_NOT_FOUND',
    });
    const provider = createProvider({
        kind: 'local',
        loadTransformers: async () => {
            throw missing;
        },
    });
    const failure = (await provider.embed('x').then(
        () => undefined,
        (error: unknown) => error,
    )) as Error;
    t.ok(failure, 'the embed rejects rather than resolving');
    t.match(failure.message, /@huggingface\/transformers/, 'the message names the package that is missing');
    t.match(failure.message, /offline/, 'and the message points at the alternatives that need no model');
    t.equal(failure.cause, missing, 'the resolution error is preserved as the cause');
});

t.test('the default loader reports the real absence of the optional package', async t => {
    // `@huggingface/transformers` is not installed and not declared, so the
    // production loader is exactly the failing case above; this asserts that
    // the shipped default, not just an injected stand-in, produces the named
    // error. It is also what executes the default dynamic import in coverage.
    //
    // ASSUMPTION this test depends on: the optional package is deliberately NOT
    // installed in this environment — it is an undeclared optional dependency,
    // not a declared one. Adding it to package.json (a plan-level decision,
    // currently recorded nowhere else) changes this test's behaviour: the load
    // succeeds and the first embed downloads the model, so this test would
    // either stop asserting absence or silently perform network I/O in CI.
    const provider = createProvider({kind: 'local'});
    await t.rejects(provider.embed('anything'), /@huggingface\/transformers/, 'the absent package is named');
    await t.rejects(provider.embed('anything again'), /@huggingface\/transformers/, 'a failed load is not cached');
});
