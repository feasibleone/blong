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
    ) => Promise<(input: string, options: {pooling: string; normalize: boolean}) => Promise<{data: Float32Array}>>;
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
    private readonly config: Required<Pick<EmbeddingConfig, 'url' | 'model'>> & {apiKey?: string; fetch: typeof fetch};
    constructor(
        config: Required<Pick<EmbeddingConfig, 'url' | 'model'>> & {apiKey?: string; fetch: typeof fetch},
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
const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2';

/** The shipped loader: a real dynamic import, so the optional package is not required to install. */
async function loadTransformers(): Promise<TransformersModule> {
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
 * Build the configured provider. Throws early on an unusable configuration —
 * including a `kind` that is not one of the three. The union stops literal
 * callers, but `kind` can arrive from untyped (JSON-sourced) configuration, and
 * an unknown value must fail here rather than silently selecting the local
 * provider.
 */
export function createProvider(config: EmbeddingConfig): EmbeddingProvider {
    if (config.kind === 'offline') {
        return new OfflineProvider(config.dimension ?? 64);
    }
    if (config.kind === 'remote') {
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
            config.dimension ?? 1536,
        );
    }
    if (config.kind === 'local') {
        return new LocalProviderAdapter(config.dimension ?? 384, config.loadTransformers ?? loadTransformers);
    }
    // Without this branch an unrecognised kind would fall through to the local
    // provider and fail later with a misleading "@huggingface/transformers is
    // missing" error rather than naming the offending value.
    throw new Error(`createProvider: unknown embedding kind '${String((config as {kind: unknown}).kind)}'`);
}
