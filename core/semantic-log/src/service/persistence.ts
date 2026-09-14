// cspell:ignore ENOENT EISDIR
/**
 * JSON snapshot persistence (PRD R4: the registry is the durable artifact).
 *
 * Deliberately a file, not a database: the spec requires that a template
 * survives a restart, and an infrastructure dependency would make the
 * acceptance suite depend on services that have nothing to do with the change.
 * The snapshot covers the **template registry** and the **per-kind union of observed
 * calls**, and nothing else — this service's digest, causal lineage, incident store,
 * flow-drift history and per-execution ring are process-lifetime surfaces by design (see
 * `.github/memory/decision.md`, Task 12 and D17).
 *
 * The write is atomic (a temp file, then `rename`) so a reader never sees half
 * a snapshot, and the temp name is unique per call so two concurrent saves of
 * one path cannot collide. Uniqueness is not ordering, though: left to the
 * filesystem, two overlapping saves would be settled by whichever `rename`
 * finished last, which may be the **older** snapshot. Saves of one path are
 * therefore serialised on a promise chain, so a snapshot written from a later
 * read of the registry can never be overwritten by one written from an earlier
 * read.
 *
 * A **missing** file is nothing to restore — a service that has never been run has no
 * snapshot, and that is not an error (`loadSnapshot` answers `undefined`). Every other
 * read failure is rethrown: treating a permission error or a directory as "no templates"
 * would start the service empty and then overwrite the real snapshot on the next
 * save. A file that exists but is not this snapshot is likewise reported rather
 * than read as empty, for the same reason: a deltas-and-counts surface must not
 * silently answer "nothing here" when what it means is "I could not read it".
 * That includes JSON that parses but is not a registry: not an object, an
 * array, `entries` that is not an array, or an array whose elements are not
 * entries. The last case matters because `registry.replaceAll` keys on
 * `entry.ref`, so a `null` or a `ref`-less object would silently become one
 * entry under the key `undefined`.
 *
 * ## Version 2: the identity, and the kinds
 *
 * A vector is only comparable with a vector from the same provider at the same width,
 * so the snapshot states **which provider wrote it** (D26): the same text embedded by
 * `sha256-hash` and by a real model share no geometry, and two widths of one provider do
 * not even share a dimension. A snapshot whose identity is not the running one is not
 * restored at all — the numbers would still add up, and every answer would be nonsense.
 *
 * Version 2 also carries the per-kind **union of observed calls** (D17), which is the one
 * thing the diagram surfaces cannot re-derive after a restart: a kind's calls are what a
 * restart would otherwise forget, while one execution's steps are of interest only while
 * it is recent and are deliberately not persisted.
 *
 * A **version 1** file is quarantined rather than migrated. Its shape has no identity, so
 * there is nothing to check its vectors against — and the one thing it holds (the
 * registry) can be rebuilt by the traffic it is there to describe. The quarantine suffix
 * names the reason (`.v1`, `.provider`, `.corrupt`), so a reader can tell an outdated file
 * from one that is unreadable from one that belongs to another embedding provider.
 */

import {readFile, rename, writeFile} from 'node:fs/promises';
import type {FlowUnion} from './flowLedger.ts';
import type {ProviderIdentity} from './provider.ts';
import type {TemplateEntry} from './registry.ts';

/** Bumped if the on-disk shape ever changes, so a reader can tell formats apart. */
const SNAPSHOT_VERSION = 2;

/**
 * What one snapshot holds.
 *
 * The provider is recorded rather than inferred: the vectors that survive a restart are
 * `centroid`s and cached embeddings, and only the provider that wrote them can say what
 * they mean.
 */
export interface Snapshot {
    provider: ProviderIdentity;
    entries: TemplateEntry[];
    kinds: FlowUnion[];
}

/** Distinguishes concurrent saves' temp files within one process. */
let counter = 0;

/**
 * The per-path save chain. Each save appends its publish to the chain for its
 * own path, so renames complete in the order the snapshots were taken rather
 * than the order the filesystem happened to finish them. Keyed by path, so two
 * different snapshots written in one process do not block each other. The
 * stored value is always settlement-tolerant (see `saveSnapshot`), so one
 * rejected save cannot poison the saves queued behind it.
 */
const queues = new Map<string, Promise<void>>();

/** Why a snapshot was not used, so the quarantine can name the reason honestly. */
export type SnapshotFault = 'corrupt' | 'unsupported' | 'provider';

/**
 * A snapshot that exists but must not be restored.
 *
 * The `fault` travels with the error because the three reasons are not the same
evidence: a file this version cannot read, a file an older version wrote, and a file
another embedding provider wrote are each kept aside under a suffix naming which one it
was. Quarantining all three as `.corrupt` would call two valid files broken.
 */
export class SnapshotError extends Error {
    readonly fault: SnapshotFault;

    constructor(fault: SnapshotFault, message: string) {
        super(message);
        this.fault = fault;
    }
}

/** A snapshot that is not this snapshot's shape, named by what was wrong. */
function malformed(path: string, what: string): SnapshotError {
    return new SnapshotError('corrupt', `loadSnapshot: ${what} (${path})`);
}

/** Is this value a string list? The one shape check the unions cannot survive without. */
function isStringList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** Write the snapshot atomically (unique temp file + rename). */
export async function saveSnapshot(path: string, snapshot: Snapshot): Promise<void> {
    // Serialise *now*, before it is this save's turn: the caller handed over the
    // registry's live entries, and the bytes must freeze at the moment the save
    // was asked for, not at the moment the earlier save ahead of it finished.
    const bytes = JSON.stringify(
        {
            version: SNAPSHOT_VERSION,
            provider: snapshot.provider,
            entries: snapshot.entries,
            kinds: snapshot.kinds,
        },
        null,
        2,
    );
    const previous = queues.get(path) ?? Promise.resolve();
    const write = previous.then(() => publish(path, bytes));
    // Remember the settlement-tolerant form, not `write` itself: a rejected save
    // must reject *its own* caller and then let the queue continue, not reject
    // every save behind it.
    queues.set(
        path,
        write.then(
            () => undefined,
            () => undefined,
        ),
    );
    await write;
}

/** Write `snapshot` to a unique temp file and publish it with one atomic rename. */
async function publish(path: string, snapshot: string): Promise<void> {
    const temporary = `${path}.${process.pid}.${counter++}.tmp`;
    await writeFile(temporary, snapshot);
    await rename(temporary, path);
}

/**
 * Read a snapshot. A missing file yields `undefined` — a service that has never run has
 * nothing to restore, and that is not a fault.
 *
 * Every read parses the file afresh, so what a caller is handed is its own: there is no
 * cache behind this function, and mutating a returned entry cannot reach the next read —
 * or the registry a later read feeds.
 *
 * The running provider's identity is a parameter rather than a comparison left to the
 * caller, because "restored under the wrong provider" is a fault of the *file* and the
 * caller has no way to see it: the numbers would parse, restore, and mean nothing.
 */
export async function loadSnapshot(
    path: string,
    expected: ProviderIdentity,
): Promise<Snapshot | undefined> {
    let raw: string;
    try {
        raw = await readFile(path, 'utf8');
    } catch (error) {
        // Only "there is no such file" is nothing to restore; anything else is
        // reported, because an empty answer here would be saved back over the
        // snapshot on the next write.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw malformed(path, 'snapshot is not valid JSON');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw malformed(path, 'snapshot is not a registry snapshot');
    }
    const {version, provider, entries, kinds} = parsed as Record<string, unknown>;
    if (version !== SNAPSHOT_VERSION) {
        throw new SnapshotError(
            'unsupported',
            `loadSnapshot: snapshot version ${String(version)} is not version ${SNAPSHOT_VERSION} (${path})`,
        );
    }
    const named = (provider ?? {}) as {kind?: unknown; model?: unknown; dimension?: unknown};
    if (
        typeof named.kind !== 'string' ||
        typeof named.model !== 'string' ||
        typeof named.dimension !== 'number'
    ) {
        throw malformed(path, 'snapshot names no embedding provider');
    }
    const identity: ProviderIdentity = {
        kind: named.kind as ProviderIdentity['kind'],
        model: named.model,
        dimension: named.dimension,
    };
    if (
        identity.kind !== expected.kind ||
        identity.model !== expected.model ||
        identity.dimension !== expected.dimension
    ) {
        throw new SnapshotError(
            'provider',
            `loadSnapshot: snapshot was written by ${describe(identity)} and this service embeds with ${describe(expected)} (${path})`,
        );
    }
    if (!Array.isArray(entries)) {
        throw malformed(path, 'snapshot entries is not an array');
    }
    // Every element must at least be keyed by a string reference: the registry
    // is a `Map` keyed by `entry.ref`, so `{"entries":[null]}` would otherwise
    // install one entry under the key `undefined` and answer a template read
    // with it. The rest of an entry's shape is the writer's contract; the key
    // is what makes the file a registry at all.
    for (const entry of entries) {
        if (typeof (entry as {ref?: unknown} | null)?.ref !== 'string') {
            throw malformed(path, 'snapshot contains an entry with no string reference');
        }
    }
    if (!Array.isArray(kinds)) {
        throw malformed(path, 'snapshot kinds is not an array');
    }
    for (const union of kinds) {
        validateUnion(path, union);
    }
    return {provider: identity, entries: entries as TemplateEntry[], kinds: kinds as FlowUnion[]};
}

/** How a provider identity reads in a message: `offline/sha256-hash/64`. */
function describe(identity: ProviderIdentity): string {
    return `${identity.kind}/${identity.model}/${identity.dimension}`;
}

/**
 * Reject a kind union the ledger could not restore.
 *
 * The bar is deliberately *safety*, not completeness: `restore` builds a `Set` from each
 * service list and a `Map` from each end list, so a union whose lists are not lists would
 * throw inside the loader's caller — during boot, where a throw is the one outcome this
 * module exists to avoid. Numbers that are merely wrong (a `NaN` count) cannot throw and
 * are left to the writer's contract.
 */
function validateUnion(path: string, union: unknown): void {
    const {kind, services, legs} = (union ?? {}) as {
        kind?: unknown;
        services?: unknown;
        legs?: unknown;
    };
    if (typeof kind !== 'string') {
        throw malformed(path, 'snapshot contains a kind with no name');
    }
    if (!isStringList(services)) {
        throw malformed(path, `snapshot kind ${kind} does not list its services`);
    }
    if (!Array.isArray(legs)) {
        throw malformed(path, `snapshot kind ${kind} does not list its calls`);
    }
    for (const leg of legs) {
        const call = (leg ?? {}) as {leg?: unknown; services?: unknown; ends?: unknown};
        if (typeof call.leg !== 'string') {
            throw malformed(path, `snapshot kind ${kind} contains a call with no name`);
        }
        if (!isStringList(call.services) || !Array.isArray(call.ends)) {
            throw malformed(path, `snapshot call ${call.leg} is not an observed call`);
        }
    }
}
