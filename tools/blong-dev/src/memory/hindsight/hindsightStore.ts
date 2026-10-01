/**
 * The one module that talks to Hindsight.
 *
 * Nothing else in the CLI imports the client, and every call fails soft: a bank
 * that is unreachable, slow, or switched off must never fail a memory write, and
 * the caller is told what happened rather than handed an exception. Ingestion is
 * queued (`async: true`) so a write waits only until the server has accepted it,
 * not for extraction or embedding to finish.
 *
 * Writes are bounded by {@link WRITE_TIMEOUT_MS}: a command that exists to edit a
 * file may not hang on a server that is not answering. The read path is bounded
 * separately, because a search is the work the user actually asked for.
 */

import type {IHindsightConfig} from './hindsightConfig.ts';
import type {IHindsightDocument} from './hindsightDocument.ts';

type Sdk = typeof import('@vectorize-io/hindsight-client');

/** The client surface this module uses; the rest of the SDK is not our business. */
export type HindsightClientLike = InstanceType<Sdk['HindsightClient']>;

/** How a client is obtained — injectable so tests never touch the network. */
export type ClientLoader = (url: string) => Promise<HindsightClientLike>;

/** Longest a memory write waits on the index before giving up on it. */
export const WRITE_TIMEOUT_MS = 5_000;

/** Longest a search waits: the server embeds the query and scores the candidates. */
export const READ_TIMEOUT_MS = 30_000;

/** Entries per retain call during a backfill, so one call is never unbounded. */
export const BACKFILL_BATCH_SIZE = 50;

/** One search result, flattened to what the CLI prints. */
export interface IHindsightHit {
    text: string;
    /**
     * The score the server ordered by.
     *
     * Deliberately not what is printed: it is not calibrated across queries (a
     * clearly-relevant match can score 0.0006 while ranked first), so it is carried
     * for `--json` consumers and used to keep the server's ordering, nothing more.
     */
    score: number | null;
    /**
     * Cosine similarity of the semantic arm (0–1) — the one number a reader can
     * interpret, and compare between queries. `null` when the semantic arm did not
     * surface this result.
     */
    similarity: number | null;
    documentId: string | null;
    tags: string[];
    context: string | null;
    type: string | null;
}

/** A call that may fail without failing the command that made it. */
export type IHindsightOutcome = {ok: true} | {ok: false; reason: string};

/** A search that may fail without failing the command that made it. */
export type IHindsightRecall = {ok: true; hits: IHindsightHit[]} | {ok: false; reason: string};

/** Filtering and budget for a search. */
export interface IRecallOptions {
    /** Tags every result must carry; recall can filter by nothing else. */
    tags?: readonly string[];
    /** Results to print, trimmed client-side — the server budgets by tokens. */
    limit?: number;
    timeoutMs?: number;
}

/** What the rest of the CLI uses the index for. */
export interface IHindsightStore {
    /** Base URL, so a message can say where the CLI tried to reach. */
    readonly url: string;
    /** Bank being read and written, for the same reason. */
    readonly bank: string;
    /** Queue documents for ingestion; existing ids are replaced. */
    retain(
        documents: readonly IHindsightDocument[],
        options?: {timeoutMs?: number},
    ): Promise<IHindsightOutcome>;
    /** Search the bank, newest relevance first. */
    recall(query: string, options?: IRecallOptions): Promise<IHindsightRecall>;
    /** Forget documents whose entries no longer exist on disk. */
    remove(
        documentIds: readonly string[],
        options?: {timeoutMs?: number},
    ): Promise<IHindsightOutcome>;
}

/**
 * Build the store for a configuration, or `null` when the index is switched off.
 *
 * A `null` return is the signal for callers to do nothing at all — no warning, no
 * attempt — which is what `HINDSIGHT_DISABLED=1` has to mean.
 */
export function createHindsightStore(
    config: IHindsightConfig,
    load: ClientLoader = loadClient,
): IHindsightStore | null {
    if (!config.enabled) return null;
    return new HindsightStore(config.url, config.bank, load);
}

/** The real client, imported lazily so a stale `node_modules` cannot break the CLI. */
async function loadClient(url: string): Promise<HindsightClientLike> {
    const {HindsightClient} = await import('@vectorize-io/hindsight-client');
    return new HindsightClient({baseUrl: url});
}

/** One retain item, in the shape the server's API expects. */
export interface IRetainItem {
    content: string;
    context: string;
    metadata: Record<string, string>;
    /** The entry id: the upsert key, so re-ingesting replaces the old document. */
    document_id: string;
    tags: string[];
    timestamp?: string;
}

/** One retain item: the entry text plus the key it is stored under. */
export function retainItem(document: IHindsightDocument): IRetainItem {
    return {
        content: document.content,
        context: document.context,
        metadata: document.metadata,
        document_id: document.documentId,
        tags: document.tags,
        ...(document.timestamp === undefined ? {} : {timestamp: document.timestamp}),
    };
}

/** Flatten one server result into the shape the CLI prints. */
export function recallHit(result: {
    text: string;
    type?: string | null;
    context?: string | null;
    document_id?: string | null;
    tags?: string[] | null;
    scores?: {final?: number | null; semantic?: number | null} | null;
}): IHindsightHit {
    const number = (value: number | null | undefined): number | null =>
        typeof value === 'number' ? value : null;
    return {
        text: result.text,
        score: number(result.scores?.final),
        similarity: number(result.scores?.semantic),
        documentId: result.document_id ?? null,
        tags: result.tags ?? [],
        context: result.context ?? null,
        type: result.type ?? null,
    };
}

/** A short, human-readable reason for a failed call. */
export function failureReason(error: unknown, timeoutMs: number): string {
    const name = (error as {name?: string} | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
        return `no answer within ${Math.round(timeoutMs / 1000)}s`;
    }
    return error instanceof Error ? error.message : String(error);
}

class HindsightStore implements IHindsightStore {
    /**
     * Plain fields rather than constructor parameter properties: Node runs
     * TypeScript in strip-only mode, where a parameter property is unsupported
     * syntax rather than something it can erase (`tsc` accepts both, so only
     * running the CLI reveals it).
     */
    url: string;
    bank: string;
    private load: ClientLoader;
    private client: Promise<HindsightClientLike> | undefined;
    private loadError: string | undefined;

    constructor(url: string, bank: string, load: ClientLoader) {
        this.url = url;
        this.bank = bank;
        this.load = load;
    }

    /**
     * The client, or a reason there is none.
     *
     * Only constructing the client happens here, so this fails for a missing
     * package rather than an unreachable server; a server that is down surfaces
     * from the call itself, which is where the timeout lives.
     */
    private async connect(timeoutMs: number): Promise<HindsightClientLike> {
        this.client ??= this.load(this.url).catch((error: unknown) => {
            this.loadError = `client unavailable (${failureReason(error, timeoutMs)})`;
            throw error;
        });
        return this.client;
    }

    async retain(
        documents: readonly IHindsightDocument[],
        options: {timeoutMs?: number} = {},
    ): Promise<IHindsightOutcome> {
        if (documents.length === 0) return {ok: true};
        const timeoutMs = options.timeoutMs ?? WRITE_TIMEOUT_MS;

        let client: HindsightClientLike;
        try {
            client = await this.connect(timeoutMs);
        } catch {
            return {ok: false, reason: this.loadError ?? 'client unavailable'};
        }

        try {
            await client.retainBatch(this.bank, documents.map(retainItem), {
                async: true,
                signal: AbortSignal.timeout(timeoutMs),
            });
            return {ok: true};
        } catch (error) {
            return {ok: false, reason: failureReason(error, timeoutMs)};
        }
    }

    async recall(query: string, options: IRecallOptions = {}): Promise<IHindsightRecall> {
        const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS;

        let client: HindsightClientLike;
        try {
            client = await this.connect(timeoutMs);
        } catch {
            return {ok: false, reason: this.loadError ?? 'client unavailable'};
        }

        try {
            const response = await client.recall(this.bank, query, {
                ...(options.tags && options.tags.length > 0
                    ? // `all_strict`: every listed tag must be present and untagged
                      // memories are excluded, so a foreign document in the bank can
                      // never surface in a search of this repository's memory.
                      {tags: [...options.tags], tagsMatch: 'all_strict' as const}
                    : {}),
                signal: AbortSignal.timeout(timeoutMs),
            });
            const hits = (response.results ?? []).map(recallHit);
            return {ok: true, hits: options.limit ? hits.slice(0, options.limit) : hits};
        } catch (error) {
            return {ok: false, reason: failureReason(error, timeoutMs)};
        }
    }

    async remove(
        documentIds: readonly string[],
        options: {timeoutMs?: number} = {},
    ): Promise<IHindsightOutcome> {
        if (documentIds.length === 0) return {ok: true};
        const timeoutMs = options.timeoutMs ?? WRITE_TIMEOUT_MS;

        let client: HindsightClientLike;
        try {
            client = await this.connect(timeoutMs);
        } catch {
            return {ok: false, reason: this.loadError ?? 'client unavailable'};
        }

        try {
            for (const documentId of documentIds) {
                await client.deleteDocument(this.bank, documentId, {
                    signal: AbortSignal.timeout(timeoutMs),
                });
            }
            return {ok: true};
        } catch (error) {
            return {ok: false, reason: failureReason(error, timeoutMs)};
        }
    }
}
