// cspell:ignore huggingface Xenova onnx

/**
 * Embedding providers (PRD R5).
 *
 * Three implementations behind one interface: a deterministic offline provider
 * (the default — no keys, no network, no model download, so tests and CI are
 * hermetic), an ONNX-backed local model, and a remote OpenAI-compatible
 * endpoint. Switching between them changes no consumer; `createProvider`
 * selects one from the configuration `app.ts` takes as an option.
 *
 * This is executed code, not a declaration module. It is also the module the
 * offline audit declares as the service's network exception (see
 * `test/offline.test.ts`): the remote provider and the local model's first-use
 * download are the only places this package reaches the network.
 */

import {createHash} from 'node:crypto';

export interface EmbeddingProvider {
    readonly dimension: number;
    embed(text: string): Promise<number[]>;
}

/**
 * The slice of `@huggingface/transformers` this package uses. Structural, so
 * the optional package never has to be installed for the package to
 * type-check, and so a test can stand in for it.
 */
export interface TransformersModule {
    pipeline: (
        task: string,
        model: string,
    ) => Promise<
        (
            input: string,
            options: {pooling: string; normalize: boolean},
        ) => Promise<{data: Float32Array}>
    >;
}

export interface EmbeddingConfig {
    kind: 'offline' | 'local' | 'remote';
    /** Offline dimensionality. */
    dimension?: number;
    /** Remote endpoint and model. */
    url?: string;
    model?: string;
    apiKey?: string;
    /** Injected for tests. */
    fetch?: typeof fetch;
    /**
     * Loads the optional `@huggingface/transformers` package. Injected so the
     * local provider is testable without the heavyweight dependency (and
     * without the model it would download on first use); the default performs
     * the real dynamic import.
     */
    loadTransformers?: () => Promise<TransformersModule>;
}

/**
 * Deterministic unit-norm vector derived from the text. Two identical
 * signatures always yield the same vector and a dot product is therefore a
 * cosine similarity — enough for structural clustering without a model.
 */
export function hashEmbedding(text: string, dimension: number): number[] {
    const values: number[] = [];
    for (let block = 0; values.length < dimension; block++) {
        const digest = createHash('sha256').update(`${block}:${text}`).digest();
        for (let i = 0; i < digest.length && values.length < dimension; i += 2) {
            values.push(digest.readUInt16BE(i) / 32767.5 - 1);
        }
    }
    // Every component is derived from a 16-bit integer, so none of them is zero
    // (32767.5 is not an integer) and the norm is positive for any width above
    // zero. A `|| 1` fallback here would be an unreachable branch hiding an
    // untested guard, which is why the normalisation has none.
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    return values.map(value => value / norm);
}

class OfflineProvider implements EmbeddingProvider {
    readonly dimension: number;
    constructor(dimension: number) {
        this.dimension = dimension;
    }
    async embed(text: string): Promise<number[]> {
        return hashEmbedding(text, this.dimension);
    }
}

class RemoteProvider implements EmbeddingProvider {
    readonly dimension: number;
    private readonly config: Required<Pick<EmbeddingConfig, 'url' | 'model'>> & {
        apiKey?: string;
        fetch: typeof fetch;
    };
    constructor(
        config: Required<Pick<EmbeddingConfig, 'url' | 'model'>> & {
            apiKey?: string;
            fetch: typeof fetch;
        },
        dimension: number,
    ) {
        this.config = config;
        this.dimension = dimension;
    }
    async embed(text: string): Promise<number[]> {
        const response = await this.config.fetch(this.config.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(this.config.apiKey ? {authorization: `Bearer ${this.config.apiKey}`} : {}),
            },
            body: JSON.stringify({input: text, model: this.config.model}),
        });
        if (!response.ok) {
            throw new Error(`embedding provider failed: ${response.status} ${response.statusText}`);
        }
        const body = (await response.json()) as {data?: Array<{embedding?: number[]}>};
        const embedding = body.data?.[0]?.embedding;
        if (!embedding) {
            throw new Error('embedding provider returned no vector');
        }
        return embedding;
    }
}

/** The optional package the local provider loads, named here so errors can name it too. */
const LOCAL_PACKAGE = '@huggingface/transformers';

/** The ONNX model the local provider downloads on first use — the network is reached through the dependency. */
export const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * The model the offline provider is, named for the identity below.
 *
 * It has no model in any machine-learning sense — it is a seeded hash — and saying so
 * is the point: a snapshot written under it must not be restored as if its vectors came
 * from a real embedding space, because they cannot answer a natural-language query.
 */
export const OFFLINE_MODEL = 'sha256-hash';

/**
 * Which provider a set of vectors came from (D26).
 *
 * A vector is only comparable with a vector from the same provider at the same width:
 * the same text embedded by `sha256-hash` and by `all-MiniLM-L6-v2` share no geometry at
 * all, and two widths of one provider do not even share a dimension. So the identity
 * travels with the vectors, and a snapshot written under one must not be restored under
 * another — the numbers would still add up and every answer would be nonsense.
 */
export interface ProviderIdentity {
    kind: 'offline' | 'local' | 'remote';
    model: string;
    dimension: number;
}

/**
 * The identity of the provider a configuration selects.
 *
 * The dimension defaults live here rather than in `createProvider`, so the identity a
 * snapshot is written under and the provider that actually embeds cannot disagree about
 * how wide the vectors are.
 *
 * A remote configuration with no `model` yields `''` here and is rejected by
 * `createProvider`: the identity exists to be written into a snapshot, and a
 * configuration that cannot build a provider never reaches one.
 */
export function providerIdentity(config: EmbeddingConfig): ProviderIdentity {
    if (config.kind === 'offline') {
        return {kind: 'offline', model: OFFLINE_MODEL, dimension: config.dimension ?? 64};
    }
    if (config.kind === 'local') {
        return {kind: 'local', model: LOCAL_MODEL, dimension: config.dimension ?? LOCAL_DIMENSION};
    }
    if (config.kind === 'remote') {
        return {kind: 'remote', model: config.model ?? '', dimension: config.dimension ?? 1536};
    }
    // The union stops literal callers, but `kind` can arrive from untyped
    // (JSON-sourced) configuration, and an unknown value must fail here rather than
    // falling through to a provider the caller did not ask for.
    throw new Error(`embedding: unknown kind '${String((config as {kind: unknown}).kind)}'`);
}

/**
 * The shipped loader: a real dynamic import, so the optional package is not required to
 * install.
 *
 * Exported because it is the one thing a capability probe has to exercise directly: calling
 * it imports the package — which is cheap, and downloads nothing — while calling `embed`
 * would fetch and compile the model. A probe that has to go through `embed` to reach the
 * loader either performs network I/O in CI or leaves the loader uncovered, and neither is
 * an acceptable answer to "is the optional dependency usable here?".
 */
export async function loadTransformers(): Promise<TransformersModule> {
    const moduleName = LOCAL_PACKAGE;
    return (await import(moduleName)) as TransformersModule;
}

/**
 * ONNX-backed local model (PRD R5), loaded lazily so the package installs and
 * runs without the optional dependency or its model present.
 *
 * The loader is injected rather than imported inline for the same reason the
 * remote provider's `fetch` is: the path must be exercisable without the
 * heavyweight dependency. A loader that cannot resolve is reported as a named,
 * actionable error — the package is optional and undeclared, so "not installed"
 * is an expected state rather than an opaque module-resolution crash.
 */
class LocalProviderAdapter implements EmbeddingProvider {
    readonly dimension: number;
    private readonly load: () => Promise<TransformersModule>;
    private extract?: (text: string) => Promise<number[]>;

    constructor(dimension: number, load: () => Promise<TransformersModule>) {
        this.dimension = dimension;
        this.load = load;
    }

    private async extractor(): Promise<(text: string) => Promise<number[]>> {
        if (this.extract) {
            return this.extract;
        }
        let transformers: TransformersModule;
        try {
            transformers = await this.load();
        } catch (cause) {
            throw new Error(
                `the 'local' embedding provider requires the optional package '${LOCAL_PACKAGE}', ` +
                    `which could not be loaded (use kind: 'offline', or a remote endpoint): ${String(cause)}`,
                {cause},
            );
        }
        const pipeline = await transformers.pipeline('feature-extraction', LOCAL_MODEL);
        const extract = async (text: string): Promise<number[]> => {
            const output = await pipeline(text, {pooling: 'mean', normalize: true});
            return Array.from(output.data);
        };
        // Stored only once the pipeline is ready, so a failed load is retried
        // rather than remembered as a permanent failure.
        this.extract = extract;
        return extract;
    }

    async embed(text: string): Promise<number[]> {
        return (await this.extractor())(text);
    }
}

/**
 * The output width of the local model, and the model itself (R5).
 *
 * Exported because a test that runs the real model has to assert the numbers the
 * documentation promises rather than whatever the model happens to return.
 */
export const LOCAL_DIMENSION = 384;

/**
 * The embedding a process environment asks for (D24).
 *
 * The shipped default stays `offline`, in CI and in production: it is deterministic, needs
 * no model download and no network, and every test that asserts a *ranking* is written
 * against something that cannot change under it. A developer who wants real vectors asks
 * for them explicitly — `SEMANTIC_LOG_EMBEDDING=local` — and the same variable is honoured
 * by the service and by the flow runner, so one setting makes a local session real.
 *
 * `remote` is deliberately *not* reachable from here: it needs a url, a model and usually a
 * key, and a process that reads three variables to build an endpoint is a configuration file
 * wearing an environment variable's clothes.
 */
export function embeddingFromEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
    const kind = env.SEMANTIC_LOG_EMBEDDING;
    if (kind === undefined || kind === '' || kind === 'offline') {
        return {kind: 'offline'};
    }
    if (kind === 'local') {
        return {kind: 'local'};
    }
    throw new Error(`SEMANTIC_LOG_EMBEDDING: unknown kind '${kind}' (use 'offline' or 'local')`);
}

/**
 * Build the configured provider. Throws early on an unusable configuration —
 * including a `kind` that is not one of the three, and a remote endpoint with no
 * url or model. The dimension is taken from the same identity the snapshot records,
 * so the vectors and the label they are stored under cannot disagree.
 */
export function createProvider(config: EmbeddingConfig): EmbeddingProvider {
    const identity = providerIdentity(config);
    if (identity.kind === 'offline') {
        return new OfflineProvider(identity.dimension);
    }
    if (identity.kind === 'remote') {
        if (!config.url || !config.model) {
            throw new Error('createProvider: remote embedding requires url and model');
        }
        return new RemoteProvider(
            {
                url: config.url,
                model: config.model,
                apiKey: config.apiKey,
                fetch: config.fetch ?? globalThis.fetch,
            },
            identity.dimension,
        );
    }
    return new LocalProviderAdapter(
        identity.dimension,
        config.loadTransformers ?? loadTransformers,
    );
}
