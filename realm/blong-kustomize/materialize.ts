/**
 * materialize.ts — compose a split tree's two halves into the objects a deploy applies, in JS because
 * the operator ships no kustomize (@@D-395 @@D-488).
 */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'yaml';
import {isClusterResource, stampSpecHash} from './apply.ts';
import {
    TEMPLATE_FILE,
    readKustomizeTree,
    type KustomizeResource,
    type KustomizeTree,
} from './generator.ts';

/** A patch that travels as text inside an instance's kustomization. */
const parsedPatch = (patch: string): unknown => parse(patch) as unknown;

/**
 * The merge keys kustomize's schema gives the lists a generated object can carry — the JS half of
 * @@D-488, and nothing more (@@D-517).
 */
export const LIST_MERGE_RULES: Array<{kind?: string; path: string[]; key: string}> = [
    // The pod specs of every workload a tree writes: a Deployment, a DaemonSet, a StatefulSet, a Job and
    // a CronJob's template all carry the same five lists.
    {path: ['containers'], key: 'name'},
    {path: ['initContainers'], key: 'name'},
    {path: ['volumes'], key: 'name'},
    {path: ['imagePullSecrets'], key: 'name'},
    {path: ['containers', 'env'], key: 'name'},
    {path: ['containers', 'volumeMounts'], key: 'mountPath'},
    {path: ['containers', 'ports'], key: 'containerPort'},
    // And the one a tree writes outside a pod spec: a Service's ports merge on the number, which is the
    // field upstream keys differently from a container's.
    {kind: 'Service', path: ['spec', 'ports'], key: 'port'},
];

/** Where a merge is happening: the kind of the object, and the fields walked to reach the value. */
interface IMergeAt {
    kind: string;
    path: string[];
}

/** The rule that decides the list at `at`, or nothing when the narrowed table does not name one. */
const listRuleAt = (at: IMergeAt): {kind?: string; path: string[]; key: string} | undefined => {
    let best: {rule: {kind?: string; path: string[]; key: string}; depth: number} | undefined;
    for (const rule of LIST_MERGE_RULES) {
        const depth = rule.path.length;
        if (depth < (best?.depth ?? 0)) continue;
        if (rule.kind && rule.kind !== at.kind) continue;
        const tail = at.path.slice(-depth);
        if (tail.length === depth && tail.every((segment, index) => segment === rule.path[index])) {
            best = {rule, depth};
        }
    }
    return best?.rule;
};

/**
 * Merge `patch` into `target` the way kustomize's strategic merge does, for the lists {@link LIST_MERGE_RULES} names.
 *
 * A list of maps no rule names is refused rather than approximated. The approximation this replaces — a list
 * of maps that all carry a `name` merges by it, anything else is replaced — was right for the shapes the split
 * happens to write today and wrong wherever upstream keys a list by something else, which is a difference
 * nothing would have reported: the pass would compose one object and a human's `kubectl apply -k` another
 * (@@F-480). The refusal names the path, and the patch that carries one is the overlay's, written by this
 * realm, so the failure points at a line this realm can fix.
 */
const mergeInto = (target: unknown, patch: unknown, at: IMergeAt): unknown => {
    if (Array.isArray(patch)) {
        const rule = listRuleAt(at);
        // A list that is not a list of maps is replaced, which is what a strategic merge does with a Job's
        // `args` or a claim's access modes.
        if (!patch.every(entry => entry && typeof entry === 'object')) return patch;
        if (!rule) {
            throw new Error(
                `no merge key is mirrored for the list at ${at.kind}.${at.path.join('.')}: kustomize ` +
                    'merges a list of maps by the key its own schema names, and guessing one here is how ' +
                    'the two composers come to differ — add the rule to LIST_MERGE_RULES',
            );
        }
        if (!Array.isArray(target)) return patch;
        // The patch's entries come first, in the patch's own order, and the base's entries the patch did
        // not touch follow. A strategic merge moves a list element it patches to the front rather than
        // leaving it where it was — a fact the generator already works around when it writes a list (the
        // fill Job's environment carries the whole list, @@D-481) and one this has to copy rather than
        // improve on, because the composer the operator runs and the composer a human's `apply -k` runs
        // have to produce the same object.
        const untouched = [...target];
        const merged: unknown[] = [];
        for (const entry of patch) {
            const value = (entry as Record<string, unknown>)[rule.key];
            const existing = untouched.findIndex(
                item => (item as Record<string, unknown> | null)?.[rule.key] === value,
            );
            if (existing < 0) merged.push(entry);
            else {
                merged.push(mergeInto(untouched[existing], entry, at));
                untouched.splice(existing, 1);
            }
        }
        return [...merged, ...untouched];
    }
    if (patch === null || typeof patch !== 'object') return patch;
    const merged = {...((target ?? {}) as Record<string, unknown>)};
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
        merged[key] =
            key in merged ? mergeInto(merged[key], value, {...at, path: [...at.path, key]}) : value;
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

/** The overlay's two namespace holders: kustomizations of the overlay, not instances of a template. */
const NAMESPACE_HOLDERS = new Set(['suite/kustomization.yaml', 'backing/kustomization.yaml']);

/**
 * A patch, wherever the overlay keeps it.
 *
 * Under the suite's own child rather than at the overlay's root, because kustomize refuses a patch outside
 * the directory of the kustomization that names it — `security; file … is not in or below …` (found in the
 * first compose of the two-level overlay).
 */
const isPatch = (path: string): boolean =>
    path.startsWith('patches/') || path.includes('/patches/');

/** The overlay's kustomization for one instance, or nothing when the path is a kustomization of the overlay itself. */
const instanceOf = (path: string): boolean =>
    path !== 'kustomization.yaml' &&
    isKustomization(path) &&
    !isPatch(path) &&
    !NAMESPACE_HOLDERS.has(path);

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
        if (!isPatch(path)) continue;
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
 * Kinds that are cluster-scoped: a namespace on one is not merely unnecessary, the API server refuses it.
 *
 * Listed rather than derived, because a tree is a document and the scope of a kind is a property of the
 * cluster that serves it — the four here are the ones a generated tree writes.
 */
const CLUSTER_SCOPED_KINDS = new Set([
    'Namespace',
    'ClusterRole',
    'ClusterRoleBinding',
    'CustomResourceDefinition',
]);

/**
 * The deployment's namespace put back on an object the split left without one, re-stamped because the hash
 * covers the object.
 *
 * An object that already names one keeps it: the split wrote everything of the deployment's without, so a
 * namespace here is either a cluster-scoped kind's own field to leave alone, or an object the base insisted
 * on placing — and overriding either would be this function deciding something the tree already said.
 */
const withNamespace = (resource: KustomizeResource, namespace?: string): KustomizeResource => {
    if (!namespace || !isClusterResource(resource)) return restamp(resource);
    if (CLUSTER_SCOPED_KINDS.has(String(resource.kind))) return restamp(resource);
    const metadata = resource.metadata as Record<string, unknown> | undefined;
    if (metadata?.namespace) return restamp(resource);
    return restamp({
        ...resource,
        metadata: {...metadata, namespace},
    } as KustomizeResource);
};

/**
 * The objects a pass applies for a generated tree: the halves and the service folders beside them,
 * each stamped with the namespace the deployment owns (@@D-504 @@D-506).
 */
export const materializeGeneratedTree = (dir: string): KustomizeTree => {
    const half = (name: string): KustomizeTree =>
        existsSync(join(dir, name)) ? readKustomizeTree(join(dir, name)) : new Map();
    if (!existsSync(join(dir, 'base'))) return readKustomizeTree(dir);
    const overlay = half('local');
    const declared = (path: string): Record<string, unknown> | undefined =>
        overlay.get(path) as Record<string, unknown> | undefined;
    const suite = declared('suite/kustomization.yaml')?.['namespace'] as string | undefined;
    // The backing child says both things this needs: the namespace its objects belong in, and *which*
    // folders are part of the tree. Reading the folder names off the disk instead — every directory
    // under `services/` — composed a service the deployment never asked for: an artifact ships the
    // folders of the suite it was built with, and a CR that switched one off left its objects in the
    // plan, in no namespace at all, so the pass applied them in the client's own namespace or was
    // refused there (@@F-480). Kustomize ignores a folder nothing references, and so must this.
    const backing = declared('backing/kustomization.yaml');
    const services = backing?.['namespace'] as string | undefined;
    const referenced = (Array.isArray(backing?.['resources']) ? backing['resources'] : [])
        .map(entry => String(entry).replace(/^(\.\.\/)+/, ''))
        .filter(entry => entry.startsWith('services/'))
        .map(entry => entry.slice('services/'.length));
    // Merged into the base side, because that is what a service folder is: objects the artifact ships,
    // kept beside the half every deployment applies rather than inside it.
    const composed = materializeSplitTree(
        new Map([
            ...half('base'),
            ...referenced.flatMap(name =>
                [...half(join('services', name))].map(
                    ([path, resource]) => [`${name}/${path}`, resource] as const,
                ),
            ),
        ]),
        overlay,
    );
    // The folders are named on disk, and that is what tells a service's objects from the base's: a
    // folder's paths start with the folder's name, while the base's own `services/` holds files (the
    // suite's process Services) rather than folders, and the overlay's services child is `backing/`.
    const folders = referenced;
    return new Map(
        [...composed].map(([path, resource]) => {
            const fromServices =
                path.startsWith('backing/') || folders.some(name => path.startsWith(`${name}/`));
            return [path, withNamespace(resource, fromServices ? services : suite)] as const;
        }),
    );
};

/**
 * Compose a base and its overlay into the object set a deploy applies: the same objects kustomize would
 * render, which for one plan is the flat tree (@@D-475).
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
                materialized = mergeInto(materialized, parsedPatch(patch.patch), {
                    kind: String((template as {kind?: unknown}).kind ?? ''),
                    path: [],
                }) as Record<string, unknown>;
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
        const object = patch
            ? (mergeInto(resource, patch, {
                  kind: String((resource as {kind?: unknown}).kind ?? ''),
                  path: [],
              }) as KustomizeResource)
            : resource;
        objects.set(path, restamp(object));
    }

    // And what the overlay holds as an object of its own is one the deploy applies. The namespace a
    // service runs in and the rights the operator has there exist only because a deployment brings one,
    // so they are the overlay's rather than the base's (@@D-504) — and a composition that took only
    // instances and patches from the overlay left both out of the tree a pass reconciles, which the
    // applied-set test caught as two ids missing.
    for (const [path, resource] of overlay) {
        if (isKustomization(path) || instanceOf(path) || isPatch(path)) continue;
        if (!isClusterResource(resource)) continue;
        objects.set(path, restamp(resource));
    }

    return new Map([...objects].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};
