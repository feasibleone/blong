/**
 * materialize.ts — turn a split tree's two halves back into the objects a deploy applies.
 *
 * A split tree is not a tree the operator can apply directly: its base holds a `PLACEHOLDER` where a
 * value the deploy owns belongs, and the objects whose *name* the deploy owns live there as templates
 * the overlay instantiates. Kustomize is what normally composes the two, but the operator is a process
 * in the cluster: it reads objects and compares them with the cluster (D-395), and it does not ship a
 * kustomize binary. So it composes here, in JS, over the two halves it already has (D-488, T-296).
 *
 * The plan is deliberately not an argument: everything this needs is in the overlay — the suffix an
 * instance's real name is built from, and the patch carrying the values the base left out. That is also
 * what makes the committed base the design that runs: a base from an older revision materializes with
 * the values of *this* deploy, not with what the current generator would have written.
 *
 * Per path of the base:
 *
 * - a template the overlay instantiates becomes one object per instance, named with the instance's
 *   `nameSuffix` and patched with what its kustomization holds;
 * - an object the overlay patches is merged with that patch;
 * - everything else is the base's object as it stands;
 * - and each object is re-stamped, because the fingerprint travels in the patch: a base fingerprint is
 *   the hash of a placeholder, which would read as "changed" to whoever compares next.
 *
 * Kustomization files are skipped: they are build instructions, and the templates are shapes rather than
 * objects. Everything the base holds besides those is an object, which is what the split promises — and
 * what the round trip against {@link buildKustomizeTree} checks, object for object.
 */
import {parse} from 'yaml';
import {isClusterResource, stampSpecHash} from './apply.ts';
import {TEMPLATE_FILE, type KustomizeResource, type KustomizeTree} from './generator.ts';

/** A patch that travels as text inside an instance's kustomization. */
const parsedPatch = (patch: string): unknown => parse(patch) as unknown;

/** Merge `patch` into `target` the way kustomize's strategic merge does, for the shapes the split writes. */
const mergeInto = (target: unknown, patch: unknown): unknown => {
    if (Array.isArray(patch)) {
        // A list of maps that all carry a `name` merges by it, entry by entry; anything else is replaced,
        // which is what a strategic merge does with a list of strings — a job's `args`, say.
        const named = patch.every(
            entry => typeof (entry as {name?: unknown} | null)?.name === 'string',
        );
        if (!named || !Array.isArray(target)) return patch;
        const merged = [...target];
        for (const entry of patch) {
            const name = (entry as {name: string}).name;
            const at = merged.findIndex(item => (item as {name?: string} | null)?.name === name);
            if (at < 0) merged.push(entry);
            else merged[at] = mergeInto(merged[at], entry);
        }
        return merged;
    }
    if (patch === null || typeof patch !== 'object') return patch;
    const merged = {...((target ?? {}) as Record<string, unknown>)};
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
        merged[key] = key in merged ? mergeInto(merged[key], value) : value;
    }
    return merged;
};

/** The template a `templates/<key>/template.yaml` path belongs to, or nothing when the path is not one. */
const templateKey = (path: string): string | undefined =>
    path.startsWith('templates/') && path.endsWith(`/${TEMPLATE_FILE}`)
        ? path.split('/')[1]
        : undefined;

/** The template key an instance's `resources` entry points at: `…/base/templates/<key>`. */
const referencedKey = (reference: string | undefined): string | undefined =>
    reference?.includes('/base/templates/') ? reference.split('/base/templates/')[1] : undefined;

/** A kustomization file, which is a build instruction rather than an object. */
const isKustomization = (path: string): boolean =>
    path === 'kustomization.yaml' || path.endsWith('/kustomization.yaml');

/** The overlay's kustomization for one instance, or nothing when the path is a kustomization of the overlay itself. */
const instanceOf = (path: string): boolean =>
    path !== 'kustomization.yaml' && isKustomization(path) && !path.startsWith('patches/');

/** The identity a patch targets, kustomize's own key: apiVersion, kind, name — with and without a namespace. */
const targetsOf = (resource: unknown): {full: string; loose: string} | undefined => {
    const object = resource as {
        apiVersion?: string;
        kind?: string;
        metadata?: {name?: string; namespace?: string};
    };
    if (!object?.kind || !object.metadata?.name) return undefined;
    const loose = `${object.apiVersion ?? ''}/${object.kind}/${object.metadata.name}`;
    return {full: `${loose}/${object.metadata.namespace ?? ''}`, loose};
};

/**
 * The overlay's patches, keyed the way kustomize matches them: by what each one targets, never by the file
 * it sits in. The split names a patch file after the object's basename, and two objects can share one — a
 * realm's `deployments/access.yaml` and its `services/access.yaml` — so the file name is not an identity.
 */
const patchesOf = (overlay: KustomizeTree): Map<string, KustomizeResource> => {
    const patches = new Map<string, KustomizeResource>();
    for (const [path, entry] of overlay) {
        if (path.startsWith('patches/') === false) continue;
        const target = targetsOf(entry);
        if (!target) continue;
        // Both keys point at the same patch: a qualified target is tried first, and the unqualified one
        // answers for an object that carries no namespace of its own.
        patches.set(target.full, entry as KustomizeResource);
        if (!patches.has(target.loose)) patches.set(target.loose, entry as KustomizeResource);
    }
    return patches;
};

/** An object with its fingerprint recomputed, so a materialized object compares like a built one. */
const restamp = (resource: KustomizeResource): KustomizeResource =>
    isClusterResource(resource) ? stampSpecHash(resource) : resource;

/**
 * Compose a base and its overlay into the object set a deploy applies: the same objects kustomize would
 * render, which for one plan is the flat tree (D-473, D-475).
 */
export const materializeSplitTree = (
    base: KustomizeTree,
    overlay: KustomizeTree,
): KustomizeTree => {
    const templates = new Map<string, KustomizeResource>();
    for (const [path, resource] of base) {
        const key = templateKey(path);
        if (key) templates.set(key, resource as KustomizeResource);
    }

    const objects = new Map<string, KustomizeResource>();
    for (const [path, entry] of overlay) {
        if (!instanceOf(path)) continue;
        const instance = entry as {
            nameSuffix?: string;
            resources?: string[];
            patches?: Array<{patch?: string}>;
        };
        const template = templates.get(referencedKey(instance.resources?.[0]) ?? '');
        if (!template) {
            throw new Error(
                `the overlay instantiates ${path}, which the base does not hold a template for: ` +
                    'the two halves are not one generation',
            );
        }
        const templateName = (template as {metadata?: {name?: string}}).metadata?.name ?? '';
        let materialized = template as Record<string, unknown>;
        for (const patch of instance.patches ?? []) {
            if (patch.patch) {
                materialized = mergeInto(materialized, parsedPatch(patch.patch)) as Record<
                    string,
                    unknown
                >;
            }
        }
        // The suffix goes on last, and not the other way round: kustomize applies it to the resources
        // before the patches see them, which is why an instance's patch names the *template*.
        materialized = {
            ...materialized,
            metadata: {
                ...((materialized.metadata ?? {}) as Record<string, unknown>),
                name: `${templateName}${instance.nameSuffix ?? ''}`,
            },
        };
        objects.set(
            `${path.slice(0, -'/kustomization.yaml'.length)}.yaml`,
            restamp(materialized as KustomizeResource),
        );
    }

    const patches = patchesOf(overlay);
    for (const [path, resource] of base) {
        if (isKustomization(path) || templateKey(path)) continue;
        const target = targetsOf(resource);
        const patch =
            (target ? patches.get(target.full) : undefined) ??
            (target ? patches.get(target.loose) : undefined);
        const object = patch ? (mergeInto(resource, patch) as KustomizeResource) : resource;
        objects.set(path, restamp(object));
    }

    return new Map([...objects].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};
