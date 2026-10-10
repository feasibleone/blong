import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse, parseAllDocuments} from 'yaml';
import {danglingReferences, isClusterResource, sweptResourceTypes} from '../../../apply.ts';
import {
    type KustomizeResource,
    artifactEntry,
    buildKustomizeTree,
    DEFAULT_SUITE_INTENTS,
    DEFAULT_UI_PATH,
    jobName,
    migrationArgs,
    readKustomizeTree,
    serializeKustomizeTree,
    SUITE_MOUNT,
    TEMPLATE_FILE,
    volumeIdentity,
    writeKustomizeTree,
} from '../../../generator.ts';
import {materializeSplitTree} from '../../../materialize.ts';
import {
    appliesUpdate,
    attemptRetentionOf,
    ATTEMPT_RETENTION_LABEL,
    fillJobsPastRetention,
    hasRetentionLabel,
    jobAttemptsPastRetention,
    jobsPastRetention,
    prunable,
    prunableByObsolescence,
    retentionOf,
    VOLUME_RETENTION_LABEL,
} from '../../../orchestrator/controller/kustomizeReconcileRun.ts';
import {suiteGenerateArgs} from '../../../orchestrator/generate/kustomizeSuiteGenerate.ts';
import {
    type IDeploymentPlan,
    DEFAULT_PROFILE,
    DEFAULT_RETENTION,
    resolveSuiteOperator,
} from '../../../plan.ts';
import {loadServiceCatalog, resolveBackingServices} from '../../../services.ts';

/**
 * server/test/test/testTreeGenerate.ts — the tree the generator writes.
 *
 * Writing is where the realm's promises are easiest to break and cheapest to check: the
 * output is a set of files, so a test can regenerate into a temporary directory and
 * compare bytes. Two runs must agree (the tree is committed and reviewed in git), the
 * folders the plan asks for must appear, and every object must carry the fingerprint the
 * operator compares against later.
 *
 * Nothing here touches a cluster: generation is a pure function of the plan.
 *
 * Registered as the `test.tree.generate` group (`integration.watch.test` in `index.ts`).
 */

/**
 * Pin a structure, in a runner that may have no snapshot context.
 *
 * `assert.snapshot` is injected by the chain when the run has a test context — TAP's `t`, which is
 * also what holds the stored snapshots — and the dev server's watch runner executes this group
 * without one (T-214), so a step that pinned *only* through a snapshot would assert nothing there.
 * What is left on that runner is the check that the structure was produced at all; the pin itself
 * waits for the runner, and saying so here is what keeps the guard out of every step.
 */
const pin = (assert: IAssert, name: string, value: unknown): void => {
    if (typeof assert.snapshot === 'function') assert.snapshot(value, name);
    else assert.ok(value, `${name}: produced (this runner has no snapshot context — T-214)`);
};

/**
 * The nodes the trees in this group are generated for.
 *
 * Two, because a `nodeLocal` volume is one directory per node and one node would pin a tree that
 * cannot show the per-node part of it. Named here rather than discovered, because a unit test has no
 * cluster to ask — the live assertions are the ones that read a real node list (D-470).
 */
const NODES = ['node-a', 'node-b'];

/**
 * The configuration one generated process is given, read off the object rather than matched in the
 * text: every file it mounts, the Secret behind each and whether a missing one is fatal, and the
 * environment it is configured by.
 *
 * Snapshotting this instead of asserting each mount in a regular expression is what stops a *new*
 * file from arriving unnoticed — a mount nothing asserted was the shape of the failures this step
 * exists for (T-252, T-253) — and it reads the document the cluster is given rather than the
 * characters the generator happened to write.
 */
const configurationOf = (text: string): unknown => {
    const document = parse(text) as {
        spec?: {
            template?: {
                spec?: {
                    containers?: Array<{
                        volumeMounts?: Array<{name?: string; mountPath?: string}>;
                        env?: Array<{name?: string; value?: string}>;
                    }>;
                    volumes?: Array<{
                        name?: string;
                        secret?: {secretName?: string; optional?: boolean};
                    }>;
                };
            };
        };
    };
    const spec = document.spec?.template?.spec;
    const secrets = new Map((spec?.volumes ?? []).map(volume => [volume.name, volume.secret]));
    return (spec?.containers ?? []).map(container => ({
        mounts: (container.volumeMounts ?? []).map(mount => ({
            mountPath: mount.mountPath,
            secretName: secrets.get(mount.name)?.secretName,
            optional: secrets.get(mount.name)?.optional,
        })),
        env: (container.env ?? []).map(entry => `${entry.name}=${entry.value}`),
    }));
};

export default handler(({lib, handler: {kustomizeTreeGenerate, kustomizePlanFind}}) => ({
    testTreeGenerate: ({name = 'tree generate'}: {name?: string} = {}) =>
        lib.group(name)([
            async function treeIsReproducible(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-tree-'));
                const specDir = mkdtempSync(join(tmpdir(), 'kustomize-tree-spec-'));
                try {
                    // The version is pinned rather than discovered, so this tree — which the snapshot
                    // test pins in full — does not change with the realm's own `package.json`. What
                    // that leaves is the reproducibility assertion this test is for, plus a tree every
                    // other test in the group can read; `theVersionLabelIsTheSuitesOwn` is where the
                    // discovery is exercised.
                    const specFile = join(specDir, 'spec.json');
                    writeFileSync(
                        specFile,
                        JSON.stringify({
                            apiVersion: 'blong.feasible.one/v1',
                            kind: 'BlongDeployment',
                            spec: {version: '1.0.0'},
                        }),
                    );
                    const first = (await kustomizeTreeGenerate(
                        {outputDir: dir, specFile, nodes: NODES},
                        $meta,
                    )) as {
                        files: string[];
                    };
                    assert.ok(
                        first.files.includes('kustomization.yaml'),
                        'the tree has a root kustomization',
                    );
                    for (const folder of ['deployments', 'services', 'rbac', 'namespaces']) {
                        assert.ok(
                            first.files.some(file => file.startsWith(`${folder}/`)),
                            `the tree has a ${folder} folder`,
                        );
                    }

                    const read = (file: string) => readFileSync(join(dir, file), 'utf8');
                    const before = new Map(first.files.map(file => [file, read(file)]));

                    const second = (await kustomizeTreeGenerate(
                        {outputDir: dir, specFile, nodes: NODES},
                        $meta,
                    )) as {
                        files: string[];
                    };
                    assert.deepEqual(
                        second.files,
                        first.files,
                        'regenerating writes exactly the same set of files',
                    );
                    const changed = second.files.filter(file => read(file) !== before.get(file));
                    assert.deepEqual(
                        changed,
                        [],
                        'every file is byte-identical after a second run',
                    );
                    // The spec is not part of the tree and is not needed by the tests that read it.
                    rmSync(specDir, {recursive: true, force: true});
                    return {dir, files: first.files};
                } catch (error) {
                    rmSync(dir, {recursive: true, force: true});
                    throw error;
                }
            },
            async function theSerializedTreeIgnoresKeyOrder(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // Key order is invisible in JavaScript and visible in the file: the tree is
                // committed and reviewed in git, so the same plan must not produce a diff just
                // because a map happened to be built in another order. The serializer sorts, and
                // this hands it the same object with every level reversed to prove it.
                const plan = (await kustomizePlanFind({nodes: NODES}, $meta)) as IDeploymentPlan;
                const tree = buildKustomizeTree(plan);
                const key = [...tree.keys()].find(path => path.startsWith('deployments/'));
                assert.ok(key, 'the tree has a deployment to compare');
                const resource = tree.get(String(key)) as KustomizeResource;
                const reverse = (value: unknown): unknown =>
                    Array.isArray(value)
                        ? value.map(reverse)
                        : value && typeof value === 'object'
                          ? Object.fromEntries(
                                Object.entries(value as KustomizeResource)
                                    .reverse()
                                    .map(([name, item]) => [name, reverse(item)]),
                            )
                          : value;
                const line = (document: KustomizeResource) =>
                    serializeKustomizeTree(new Map([[String(key), document]])).get(String(key)) ??
                    '';
                const straight = line(resource);
                assert.equal(
                    line(reverse(resource) as KustomizeResource),
                    straight,
                    'reversing every key leaves the file identical',
                );
                // And the order it settled on is sorted at every level, which is what makes the
                // bytes a function of the content rather than of the map's history.
                const sorted = (value: unknown, path: string): void => {
                    if (Array.isArray(value)) {
                        value.forEach((item, index) => sorted(item, `${path}[${index}]`));
                        return;
                    }
                    if (!value || typeof value !== 'object') return;
                    const names = Object.keys(value);
                    assert.deepEqual(names, [...names].sort(), `${path} keys are sorted`);
                    for (const name of names) {
                        sorted((value as Record<string, unknown>)[name], `${path}.${name}`);
                    }
                };
                sorted(parse(straight), '$');
            },

            async function aCrSpecDrivesTheTree(assert: IAssert, {$meta}: {$meta: IMeta}) {
                // The operator generates for a CR it does not hold (T-234), so the spec arrives as a
                // file; it wins only where it names a field. The suite's *name* is not one of them any
                // more: it is the CR's own `metadata.name`, which the operator passes beside the spec
                // (Q4), so a spec that names a suite must not rename the process it is generated for —
                // which is what the first assertion is here to notice.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-spec-'));
                try {
                    const specFile = join(dir, 'spec.json');
                    const outputDir = join(dir, 'tree');
                    writeFileSync(
                        specFile,
                        JSON.stringify({
                            apiVersion: 'blong.feasible.one/v1',
                            kind: 'BlongDeployment',
                            spec: {suite: 'from-cr', profile: 'monolith'},
                        }),
                    );
                    const written = (await kustomizeTreeGenerate(
                        {outputDir, specFile, nodes: NODES},
                        $meta,
                    )) as {
                        files: string[];
                    };
                    // What the spec did and did not decide: a suite name in the spec renames nothing
                    // (the CR object carries the name), the process and its namespace keep the name
                    // the suite configured, and `monolith` — the one thing that spec said — is obeyed
                    // as one process for the whole suite rather than one per realm.
                    pin(assert, 'crSpec', {
                        namedAfterTheSpec: written.files.filter(file => file.includes('from-cr')),
                        processes: written.files.filter(
                            file =>
                                file.startsWith('deployments/') &&
                                !file.endsWith('kustomization.yaml'),
                        ),
                        namespaces: written.files.filter(
                            file =>
                                file.startsWith('namespaces/') &&
                                !file.endsWith('kustomization.yaml'),
                        ),
                    });
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aSplitTreeKeepsTheArtifactOutOfTheBase(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // The repository tree is split so that a dev cluster's node names and a deploy's digest
                // never enter it (D-473, D-475): the base is the same files for every deploy, and the
                // overlay carries what one deploy says. Nothing else reads that boundary — a base that
                // grew a node name would still compose — so this is where the promise is checked.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-split-'));
                try {
                    const listed = (await kustomizePlanFind(
                        {nodes: NODES},
                        $meta,
                    )) as IDeploymentPlan;
                    // An artifact that names a digest, because that is what the identity is: without one
                    // the identity *is* the version, and a base holds the version for reasons of its own —
                    // which is how a check for "no identity in the base" comes back true for every file.
                    const plan = {
                        ...listed,
                        suiteVolume: {
                            ...listed.suiteVolume,
                            artifact: {
                                source: 'url',
                                url: 'http://artifact/suite.zip',
                                digest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
                            },
                        },
                    } as IDeploymentPlan;
                    const written = writeKustomizeTree(buildKustomizeTree(plan), dir, {
                        layout: 'split',
                        plan,
                    });
                    const read = (file: string): string => readFileSync(join(dir, file), 'utf8');
                    const identity = volumeIdentity(plan);
                    const base = written.filter(file => file.startsWith('base/'));
                    const local = written.filter(file => file.startsWith('local/'));
                    // The instance kustomizations, as directories: the overlay's whole content beyond the
                    // patches, and the reason the base can hold one template instead of one Job per node.
                    const instances = [
                        ...new Set(
                            local
                                .filter(file => file.endsWith('/kustomization.yaml'))
                                .map(file => dirname(file))
                                .filter(at => at !== 'local'),
                        ),
                    ];
                    const baseText = base.map(read).join('\n');
                    const localText = local.map(read).join('\n');
                    const first = plan.deployments[0]?.name ?? '';
                    pin(assert, 'splitTree', {
                        // One of the two sides names the nodes and the artifact, and it is not the base.
                        nodesInBase: NODES.filter(node => baseText.includes(node)).length,
                        nodesInLocal: NODES.filter(node => localText.includes(node)).length,
                        identityInBase: baseText.includes(identity),
                        // Named rather than merely counted: when the promise breaks, the answer to
                        // "which file" is the whole of the diagnosis.
                        identityInBaseFiles: base.filter(file => read(file).includes(identity)),
                        identityInLocal: localText.includes(identity),
                        // The base keeps the *shape*: the templates the overlay builds an instance from,
                        // which is where a reader sees what a fill Job is — script included, since the
                        // script reads its settings from the environment and is the same text for every
                        // node (D-477). No ConfigMap and no mount.
                        templatesInBase: base.filter(file => file.startsWith('base/templates/'))
                            .length,
                        scriptInTemplate: read('base/templates/fill/template.yaml').includes(
                            '.blong-artifact-ready',
                        ),
                        scriptMounted: read('base/templates/fill/template.yaml').includes(
                            '/script/',
                        ),
                        // The overlay is small: one kustomization per instance, and one patch per object
                        // that carries a value rather than a name.
                        instanceDirs: [...instances].sort(),
                        patches: written.filter(file => file.startsWith('local/patches/')).length,
                        // A workload holds a source that names no artifact, and the patch beside it holds
                        // the real one.
                        placeholderInBase: read(`base/deployments/${first}.yaml`).includes(
                            SUITE_MOUNT,
                        ),
                        realVolumeInPatch: read(`local/patches/${first}.yaml`).includes(identity),
                        placeholdersInTemplate: read(
                            `base/templates/fill/${TEMPLATE_FILE}`,
                        ).includes('PLACEHOLDER'),
                    });
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aWrittenTreeReadsBackAsItself(assert: IAssert, {$meta}: {$meta: IMeta}) {
                // The operator applies the tree its child wrote (D-395), so reading it back has to
                // return the same objects — fingerprints included, because an unchanged object is
                // recognised by its fingerprint rather than re-applied.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-read-'));
                try {
                    const plan = (await kustomizePlanFind(
                        {nodes: NODES},
                        $meta,
                    )) as IDeploymentPlan;
                    const built = buildKustomizeTree(plan);
                    writeKustomizeTree(built, dir);
                    const read = readKustomizeTree(dir);
                    // A tree may carry a document as text, and the reader answers objects: the
                    // comparable form of both is the parsed one. The round trip is one equality over
                    // the whole tree rather than one per file — a file that failed to come back fails
                    // it just as loudly, and the fingerprint comes back with it.
                    const comparable = (tree: Map<string, unknown>) =>
                        Object.fromEntries(
                            [...tree].map(([path, resource]) => [
                                path,
                                typeof resource === 'string'
                                    ? (parse(resource) as KustomizeResource)
                                    : resource,
                            ]),
                        );
                    assert.deepEqual(
                        comparable(read),
                        comparable(built),
                        'every file comes back as it was written, fingerprints included',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aBaseAndItsOverlayMaterializeToTheFlatTree(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // The operator has no kustomize binary, so it composes the two halves itself (D-488): a
                // materialized pair has to be the tree the generator would have written flat, object for
                // object. That equality is the whole contract of the split, and the reason the base can
                // be committed and the overlay generated in the cluster (D-473, D-475, T-296).
                const flatDir = mkdtempSync(join(tmpdir(), 'kustomize-flat-'));
                const treeDir = mkdtempSync(join(tmpdir(), 'kustomize-halves-'));
                try {
                    const plan = (await kustomizePlanFind(
                        {nodes: NODES},
                        $meta,
                    )) as IDeploymentPlan;
                    const built = buildKustomizeTree(plan);
                    writeKustomizeTree(built, flatDir);
                    writeKustomizeTree(built, treeDir, {layout: 'base', plan});
                    writeKustomizeTree(built, treeDir, {layout: 'local', plan});
                    const materialized = materializeSplitTree(
                        readKustomizeTree(join(treeDir, 'base')),
                        readKustomizeTree(join(treeDir, 'local')),
                    );
                    // Only the objects count: a base carries templates and kustomizations beside them,
                    // which the materializer either instantiates or leaves out.
                    const objects = (tree: Map<string, unknown>): Record<string, unknown> =>
                        Object.fromEntries(
                            [...tree]
                                .filter(([, resource]) =>
                                    isClusterResource(resource as KustomizeResource),
                                )
                                .map(([path, resource]) => [
                                    path,
                                    typeof resource === 'string'
                                        ? (parse(resource) as unknown)
                                        : resource,
                                ]),
                        );
                    assert.deepEqual(
                        objects(materialized),
                        objects(readKustomizeTree(flatDir)),
                        'a base and its overlay materialize into the flat tree, object for object',
                    );
                } finally {
                    rmSync(flatDir, {recursive: true, force: true});
                    rmSync(treeDir, {recursive: true, force: true});
                }
            },

            async function aSplitTreeComposesToTheFlatTree(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // The other half of the contract, and the one the cluster's own apply uses: kustomize has
                // to render the overlay into the same objects the generator writes flat. The round trip
                // above checks the JS composer; nothing checked kustomize before this step, and the gap
                // between the two is exactly where a patch that no longer matches a target hides.
                try {
                    execFileSync('kubectl', ['kustomize', '--help'], {stdio: 'ignore'});
                } catch {
                    return {
                        skipped:
                            'no kubectl on PATH: this step composes the split tree with kustomize and ' +
                            'compares the result with the flat tree',
                    };
                }
                const flatDir = mkdtempSync(join(tmpdir(), 'kustomize-flat-'));
                const treeDir = mkdtempSync(join(tmpdir(), 'kustomize-compose-'));
                try {
                    const plan = (await kustomizePlanFind(
                        {nodes: NODES},
                        $meta,
                    )) as IDeploymentPlan;
                    const built = buildKustomizeTree(plan);
                    writeKustomizeTree(built, flatDir);
                    writeKustomizeTree(built, treeDir, {layout: 'base', plan});
                    writeKustomizeTree(built, treeDir, {layout: 'local', plan});
                    const rendered = execFileSync(
                        'kubectl',
                        ['kustomize', join(treeDir, 'local')],
                        {encoding: 'utf8'},
                    );
                    // Compared by identity rather than by path: a rendered stream carries no paths, and a
                    // path is not an identity anyway — a realm's `deployments/access.yaml` and its
                    // `services/access.yaml` share a basename. Null-valued keys are dropped because
                    // kustomize's own emission adds them for typed objects and the generator does not.
                    const withoutNulls = (value: unknown): unknown =>
                        Array.isArray(value)
                            ? value.map(withoutNulls)
                            : value && typeof value === 'object'
                              ? Object.fromEntries(
                                    Object.entries(value as Record<string, unknown>)
                                        .filter(([, entry]) => entry !== null)
                                        .map(([key, entry]) => [key, withoutNulls(entry)]),
                                )
                              : value;
                    const identityOf = (object: KustomizeResource): string => {
                        const meta = object as {
                            apiVersion?: string;
                            kind?: string;
                            metadata?: {name?: string; namespace?: string};
                        };
                        return [
                            meta.apiVersion ?? '',
                            meta.kind ?? '',
                            meta.metadata?.namespace ?? '',
                            meta.metadata?.name ?? '',
                        ].join('/');
                    };
                    const byIdentity = (objects: KustomizeResource[]): Record<string, unknown> =>
                        Object.fromEntries(
                            objects.map(object => [identityOf(object), withoutNulls(object)]),
                        );
                    const flat = [...readKustomizeTree(flatDir)]
                        .map(([, resource]) => resource)
                        .filter(resource => isClusterResource(resource as KustomizeResource))
                        .map(
                            resource =>
                                (typeof resource === 'string'
                                    ? parse(resource)
                                    : resource) as KustomizeResource,
                        );
                    const composed = parseAllDocuments(rendered)
                        .map(document => document.toJSON() as KustomizeResource)
                        .filter(object => isClusterResource(object));
                    assert.deepEqual(
                        byIdentity(composed),
                        byIdentity(flat),
                        'kustomize composes the overlay into the flat tree, object for object',
                    );
                } finally {
                    rmSync(flatDir, {recursive: true, force: true});
                    rmSync(treeDir, {recursive: true, force: true});
                }
            },

            async function anArtifactEntryIsFoundInAnyDirectory(assert: IAssert) {
                // The entry a CR names is absolute inside the deployment's mount, and the operator
                // unpacks the same artifact elsewhere: the suffix after the mount is what identifies
                // the file (D-398).
                // The entry a CR names is absolute inside the deployment's mount, and the operator
                // unpacks the same artifact elsewhere: the suffix after the mount is what identifies
                // the file (D-398). The three answers are one structure — the mount, an entry that is
                // already relative, and an artifact that names none — so they are pinned together.
                pin(assert, 'artifactEntry', {
                    mounted: artifactEntry(
                        '/cache/demo/9',
                        '/opt/deploy/suite/suite/blong-suite/index.ts',
                    ),
                    relative: artifactEntry('/cache/demo/9', 'index.ts'),
                    none: artifactEntry('/cache/demo/9'),
                });
            },

            async function oneIngressPerHost(assert: IAssert) {
                // An Ingress is grouped by host, not by deployment (Phase 15 C, Q3): a host is what a
                // certificate and a DNS record belong to, so a portal and a realm's webhook land in
                // the same object when they share one — and a host nothing else uses gets its own.
                const base = lib.suitePlan({
                    profile: 'monolith',
                    portal: {
                        store: {
                            realm: 'shop',
                            host: 'ui.shop.example',
                            path: '/shop',
                            auth: {type: 'basic', secretName: 'ui-auth'},
                            deployment: 'shop',
                        },
                    },
                    ingresses: [
                        {
                            name: 'webhook',
                            namespace: 'shop-suite',
                            // Not the portal's host: an Ingress carries one set of annotations for the
                            // whole host, and the portal's are its authentication (T-241).
                            host: 'hooks.shop.example',
                            path: '/webhook',
                            pathType: 'Prefix',
                            serviceName: 'shop',
                            servicePort: 8080,
                        },
                        {
                            name: 'api',
                            namespace: 'shop-suite',
                            host: 'api.shop.example',
                            path: '/',
                            pathType: 'Prefix',
                            serviceName: 'api-svc',
                            servicePort: 8080,
                            tls: {secretName: 'api-tls'},
                        },
                    ],
                }) as unknown as Record<string, unknown>;
                const tree = buildKustomizeTree(base as never);
                const ingressFiles = [...tree.keys()]
                    .filter(path => path.startsWith('ingresses/'))
                    .filter(path => !path.endsWith('kustomization.yaml'))
                    .sort();
                // One Ingress per host, named after the host, and what each carries is the host it
                // serves, its paths, its backend, its certificate and the annotations a *host* is
                // behind — which is why the portal's authentication rides the host that serves it and
                // reaches neither the webhook beside it nor a certificate of its own (T-241).
                pin(assert, 'ingresses', {
                    ingressFiles,
                    hosts: Object.fromEntries(
                        ingressFiles.map(path => {
                            const ingress = tree.get(path) as {
                                metadata?: {annotations?: unknown};
                                spec?: {
                                    tls?: unknown;
                                    rules?: Array<{host?: string; http?: {paths?: unknown}}>;
                                };
                            };
                            const rule = ingress.spec?.rules?.[0];
                            return [
                                path,
                                {
                                    host: rule?.host,
                                    paths: rule?.http?.paths,
                                    tls: ingress.spec?.tls,
                                    annotations: ingress.metadata?.annotations,
                                },
                            ];
                        }),
                    ),
                });
                assert.ok(
                    tree.has('services/store-http.yaml'),
                    'and the portal has the Service its path points at, named after the alias',
                );

                // And the host is not shared: a webhook beside a portal would inherit the portal's
                // authentication, which is what makes an `oauth2` portal ask a machine for a browser
                // login. There is no per-path annotation to give it its own, so the tree refuses —
                // naming both sides, because the fix is to move one of them (T-241).
                assert.throws(
                    () =>
                        buildKustomizeTree({
                            ...base,
                            ingresses: [
                                (base.ingresses as Array<Record<string, unknown>>)[0],
                                {
                                    ...(base.ingresses as Array<Record<string, unknown>>)[0],
                                    host: 'ui.shop.example',
                                },
                            ],
                        } as never),
                    /shares host "ui\.shop\.example" with "\/webhook"/,
                    'a webhook on the portal host is refused rather than written behind its auth',
                );
            },

            async function eachPortalNamesItsOwnService(assert: IAssert) {
                // A portal is an address, an alias and the process behind it (the portal answer). The
                // alias is what names the Service, because it is the name a person chose and the one
                // that survives a profile change: two portals may front one process and publish two
                // names for it rather than two objects claiming one name.
                const tree = buildKustomizeTree(
                    lib.suitePlan({
                        portal: {
                            store: {host: 'shop.example', deployment: 'shop'},
                            admin: {host: 'admin.example', deployment: 'admin'},
                            // One process, two addresses: the second alias tells them apart.
                            adminPanel: {
                                host: 'admin.example',
                                path: '/admin',
                                deployment: 'admin',
                            },
                        },
                    }),
                );

                // A Service per portal, named after its alias rather than after the process behind it,
                // because the alias is the name a person chose and the one that survives a profile
                // change: two portals may front one process and publish two names for it rather than
                // two objects claiming one name. What each selects, and the paths one host carries
                // when two portals share it, are pinned with the list.
                pin(assert, 'portalServices', {
                    files: [...tree.keys()]
                        .filter(path => path.startsWith('services/'))
                        .filter(path => path.endsWith('-http.yaml'))
                        .sort(),
                    selector: (
                        tree.get('services/adminPanel-http.yaml') as {
                            spec?: {selector?: unknown};
                        }
                    )?.spec?.selector,
                    ingressPaths: (
                        tree.get('ingresses/admin-example.yaml') as {
                            spec?: {
                                rules?: Array<{http?: {paths?: Array<{backend?: unknown}>}}>;
                            };
                        }
                    )?.spec?.rules?.[0]?.http?.paths?.map(entry => entry.backend),
                });
            },

            async function aPathClaimedTwiceIsRefused(assert: IAssert) {
                // Two entries at one path on one host would leave the controller to pick whichever it
                // read first, and an Ingress that answers from a coin toss is the wrong nobody can
                // reproduce — so it is refused where the tree is built instead of discovered as a
                // route that works on one cluster and not another.
                assert.throws(
                    () =>
                        buildKustomizeTree(
                            lib.suitePlan({
                                portal: {
                                    store: {host: 'shop.example', deployment: 'shop'},
                                    admin: {host: 'shop.example', deployment: 'admin'},
                                },
                            }),
                        ),
                    /two entries claim path/,
                    'a path two entries claim is refused rather than resolved by order',
                );
            },

            async function theClusterSuppliesTheConfigurationAsFiles(
                assert: IAssert,
                {
                    treeIsReproducible: generated,
                }: {
                    treeIsReproducible: Promise<{dir: string; files: string[]}>;
                },
            ) {
                // A released process reads three files the cluster may supply — the cross-deployment
                // settings the realm manages for every suite, the one a user manages for the cluster,
                // and the key pair, which is a *file* rather than two variables only the framework
                // knows about, because `rc` reads `$HOME/.config/<app-name>/config` (Q7, D-441). Three
                // things are worth pinning and they are the same three for each: that a mount names
                // the file, that a missing Secret is `optional` (a mount is not a promise the file
                // exists, so a pod has to run on its defaults), and that the pod is configured by the
                // name its rc file is built from — the trailing intent, which `BLONG_ENV` overrides
                // rather than the namespace it used to carry (T-252, T-253). The tree names the
                // Secrets and never writes them: creating one is a deployment's act.
                const {dir, files} = await generated;
                // No `finally` that removes the directory: the fixture is the group's, and the test
                // that owns it is the one that cleans it up.
                const deployments = files.filter(
                    file =>
                        file.startsWith('deployments/') &&
                        file.endsWith('.yaml') &&
                        !file.endsWith('kustomization.yaml'),
                );
                assert.ok(deployments.length, 'the tree has a process to mount into');
                pin(
                    assert,
                    'clusterConfiguration',
                    Object.fromEntries(
                        deployments.map(file => [
                            file,
                            configurationOf(readFileSync(join(dir, file), 'utf8')),
                        ]),
                    ),
                );
            },

            async function theCrdDefaultsAreThePlannersDefaults(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // A CR reaches the operator in two shapes and they have to mean the same thing:
                // applied to a cluster, where the API server fills in the `default:` keys the CRD
                // declares, and read as a *file* — which is what the operator does — where nothing
                // fills anything in and the planner falls back on its own constants. Two trees, one
                // with every default spelled out and one with all of them omitted, are the cheapest
                // way to state that the two mechanisms agree; a field added to one and not the other
                // shows up as a diff here rather than as a CR that behaves differently depending on
                // how it was handed over (Q4).
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-crd-defaults-'));
                try {
                    const write = (name: string, spec: Record<string, unknown>): string => {
                        const file = join(dir, `${name}.json`);
                        writeFileSync(
                            file,
                            JSON.stringify({
                                apiVersion: 'blong.feasible.one/v1',
                                kind: 'BlongDeployment',
                                spec,
                            }),
                        );
                        return file;
                    };
                    // `portal` is what makes a published entry point exist at all, so the two specs
                    // differ only in the fields the CRD gives a default to. The CR carries no suite
                    // name: its identity is its own `metadata.name` (Q4).
                    const shared = {portal: {web: {realm: 'kustomize', host: 'ui.defaults.test'}}};
                    const omitted = write('omitted', shared);
                    const spelled = write('spelled', {
                        ...shared,
                        profile: DEFAULT_PROFILE,
                        intents: [...DEFAULT_SUITE_INTENTS],
                        portal: {
                            web: {
                                realm: 'kustomize',
                                host: 'ui.defaults.test',
                                path: DEFAULT_UI_PATH,
                            },
                        },
                        suiteVolume: {backend: 'auto', retention: DEFAULT_RETENTION},
                    });
                    const read = async (specFile: string, name: string) => {
                        const outputDir = join(dir, name);
                        const written = (await kustomizeTreeGenerate(
                            {outputDir, specFile, nodes: NODES},
                            $meta,
                        )) as {
                            files: string[];
                        };
                        return Object.fromEntries(
                            written.files.map(file => [
                                file,
                                readFileSync(join(outputDir, file), 'utf8'),
                            ]),
                        );
                    };
                    assert.deepEqual(
                        await read(spelled, 'spelled'),
                        await read(omitted, 'omitted'),
                        'a CR that spells the defaults out and one that omits them are one tree',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function olderJobAttemptsArePrunedByRetention(assert: IAssert) {
                // A Job attempt is obsolete the moment a new one is generated, and an obsolete Job is
                // evidence rather than litter: this is the policy that decides which of them a pass
                // may remove (D-386, Q6). The current attempt is not in this list at all — it is in
                // the tree — so `retention - 1` older ones make the count up, and a failure is not
                // treated differently from a success, because a failed deploy is what one reads.
                const attempts = (count: number) =>
                    Array.from({length: count}, (_, index) => ({
                        apiVersion: 'batch/v1',
                        kind: 'Job',
                        metadata: {
                            name: `shop-migrate-${index}`,
                            labels: {'blong.feasible.one/attempt-retention': '3'},
                            creationTimestamp: `2026-10-0${index + 1}T00:00:00Z`,
                        },
                    })) as never[];
                const names = (objects: unknown[]): string[] =>
                    objects.map(object => (object as {metadata: {name: string}}).metadata.name);

                // The policy in one structure: what a pass removes when there are fewer attempts than
                // the retention and when there are more, the retention it reads off the objects and
                // the one it falls back to when there is nothing to read, and whether a Job may be
                // replaced at all — it may not, because its name carries the attempt, so an existing
                // one *is* this attempt and is waited on instead (D-386, F-407).
                pin(assert, 'retention', {
                    belowRetention: names(jobAttemptsPastRetention(attempts(2), 3)).sort(),
                    pastRetention: names(jobAttemptsPastRetention(attempts(4), 3)).sort(),
                    // Two readers for two numbers (D-471): an attempt declares how many attempts stay,
                    // and a volume that declares nothing is counted by its own default — which is what
                    // says the two are not one knob read twice.
                    declared: attemptRetentionOf(attempts(1)),
                    attemptFallback: attemptRetentionOf([]),
                    volumeFallback: retentionOf([]),
                    jobReplaced: appliesUpdate('job'),
                    deploymentReplaced: appliesUpdate('deployment'),
                });
                // Where a pass may delete at all, which is the other half of the same policy (D-461):
                // the suite's namespace and nothing wider, which is what lets a switch remove the
                // alias a realm's config dials while leaving a generated service's workload — in a
                // namespace of its own — for whoever owns that namespace to retire.
                pin(assert, 'prunable', {
                    insideSuite: names(
                        prunable(
                            [
                                {
                                    kind: 'Service',
                                    metadata: {name: 'in-the-suite', namespace: 'shop-suite'},
                                },
                                {
                                    kind: 'Deployment',
                                    metadata: {name: 'in-its-own', namespace: 'shop-services'},
                                },
                                // Cluster-scoped: nothing to compare, and nothing a pass may remove
                                // from the rights the install granted it.
                                {kind: 'ClusterRole', metadata: {name: 'no-namespace'}},
                            ],
                            'shop-suite',
                        ),
                    ),
                    deploymentInsideTheSuite: names(
                        prunable(
                            [
                                {
                                    kind: 'Deployment',
                                    metadata: {name: 'in-the-suite-too', namespace: 'shop-suite'},
                                },
                            ],
                            'shop-suite',
                        ),
                    ),
                });
                // And what a pass may remove by obsolescence on its own, which is everything except
                // the objects whose retirement a number decides: the volume of an identity a suite is
                // not currently running, and the attempts a previous deploy left, both look obsolete to
                // a diff and are kept by their own retirement step — which is what keeps them from
                // fighting the pass (T-282, D-471).
                pin(assert, 'obsolescence', {
                    versionNamedLeftAlone: names(
                        prunableByObsolescence([
                            {
                                kind: 'PersistentVolumeClaim',
                                metadata: {
                                    name: 'shop-1.0.0',
                                    labels: {'blong.feasible.one/retention': '3'},
                                },
                            },
                            // The same rule off the second label: an attempt is retired by the attempt
                            // number, not by a diff that no longer names it.
                            {
                                kind: 'Job',
                                metadata: {
                                    name: 'shop-migrate-0.9.0-abc12345',
                                    labels: {'blong.feasible.one/attempt-retention': '5'},
                                },
                            },
                            {kind: 'Service', metadata: {name: 'the-alias'}},
                        ]),
                    ),
                    sweptKinds: sweptResourceTypes().length,
                });
            },

            async function aChangedJobIsANewJob(assert: IAssert) {
                // A Job's spec is immutable, so the only way a changed attempt can reach a cluster is
                // under a new name (D-386, Q6). The name therefore carries the version and a hash of
                // what the Job runs, which is what the fixed `<suite>-migrate` could not do: it needed
                // the failed Job deleted before the next attempt could be created, and that deleted
                // the evidence. The three assertions are the property in full — the shape, that a
                // different input is a different Job, and that the same plan regenerates the same name
                // so an ordinary re-apply is not mistaken for a new attempt.
                const plan = (suite: Record<string, unknown>) =>
                    buildKustomizeTree(lib.suitePlan({suite: {...lib.pinnedSuite, ...suite}}));
                const pathOf = (tree: Map<string, unknown>): string =>
                    [...tree.keys()].find(
                        path =>
                            path.startsWith('deployer/') &&
                            path.endsWith('.yaml') &&
                            !path.endsWith('kustomization.yaml'),
                    ) ?? '';
                const nameOf = (tree: Map<string, unknown>): string =>
                    String(
                        (tree.get(pathOf(tree)) as {metadata?: {name?: string}})?.metadata?.name ??
                            '',
                    );

                // The names are the property: one attempt is named after the suite, the step, the
                // version and a hash of what the Job runs, the file it is written to keeps its name
                // so a review can diff it, and a name that changes with the entry and with the version
                // — but not with the act of regenerating — is what makes an attempt new (D-386).
                pin(assert, 'jobNames', {
                    first: nameOf(plan({})),
                    file: pathOf(plan({})),
                    otherEntry: nameOf(plan({entry: '/opt/deploy/suite/other.ts'})),
                    otherVersion: nameOf(plan({version: '9.9.10'})),
                    regenerated: nameOf(plan({})),
                });
            },

            async function theAttemptNameIgnoresHowTheIntentsWereSpelled(assert: IAssert) {
                // The name is a hash of what the Job runs, and the command line already spells the
                // intents out (`migrationArgs` falls back to the defaults). Hashing the intents *field*
                // as well made the name depend on whether they were written down — and they are often
                // not: the CRD declares `intents` (and `portal.*.path`) as defaults, so the API server
                // materialises them into a CR whose author never wrote them, and the tenant's tree and
                // the operator's plan of one suite hashed differently. One cluster ended up with two
                // attempts for one migration step, and the first failed because it ran before its volume
                // was seeded (F-410).
                const attemptName = (suite: Record<string, unknown>): string =>
                    jobName(
                        {
                            suite: {...lib.pinnedSuite, ...suite},
                            // The name hashes the container the step runs, so the plan has to be one a
                            // container can be built from: the volume is what the migration mounts.
                            suiteVolume: lib.nodeLocalVolume,
                        } as never,
                        'migrate',
                    );

                // Four spellings of the intents, and the names they produce: the defaults written down
                // and omitted name one attempt, a CR that still names the development intent names the
                // same one, and an intent a deployment does run with is a different attempt — the
                // equality and the difference are both visible in the pin (F-410).
                pin(assert, 'attemptNames', {
                    omitted: attemptName({}),
                    spelled: attemptName({intents: DEFAULT_SUITE_INTENTS}),
                    legacy: attemptName({intents: ['microservice', 'release']}),
                    debug: attemptName({intents: ['debug']}),
                });
            },

            async function theMigrationStepReadsTheFileItMounts(assert: IAssert) {
                // The migration Job mounts the same two rc files every other pod mounts, and the file a
                // run actually reads is named after its **trailing** intent (Phase 15 E). With `db`
                // last it read `blong_db` and `/etc/blong_db` — two files nobody creates — so the
                // tenant's cross-deployment settings, the database password among them, were mounted
                // and never read, and nothing failed to say so (T-253). What is pinned here is the
                // pair: the Job reads a file, and that file is the one its own mounts name.
                const plan = (
                    suite: Record<string, unknown>,
                    volume: 'nodeLocal' | 'shared' = 'nodeLocal',
                ) =>
                    buildKustomizeTree(
                        lib.suitePlan({
                            suite: {...lib.pinnedSuite, ...suite},
                            suiteVolume:
                                volume === 'shared' ? lib.sharedVolume : lib.nodeLocalVolume,
                        }),
                    );

                const jobOf = (tree: Map<string, unknown>): string =>
                    [...tree.keys()].find(
                        path =>
                            path.startsWith('deployer/') &&
                            path.endsWith('.yaml') &&
                            // The folder's own kustomization is a build instruction, not the step:
                            // sorted first, so a reader that takes the first match reads it instead.
                            !path.endsWith('kustomization.yaml'),
                    ) ?? '';
                const argsOf = (suite: Record<string, unknown>): string[] => {
                    const tree = plan(suite);
                    const file = jobOf(tree);
                    const job = tree.get(file) as {
                        spec?: {template?: {spec?: {containers?: Array<{args?: string[]}>}}};
                    };
                    return job.spec?.template?.spec?.containers?.[0]?.args ?? [];
                };

                // `minimist` reads `--marine.orchestrator release` as
                // `{marine: {orchestrator: 'release'}}`, so the intents have to come *before* the
                // selectors: a positional that follows a flag is swallowed as that flag's value, and
                // the step then ran without the deployment's config and dialled the default
                // `127.0.0.1:3306` while every pod around it connected (T-267). What decides which rc
                // file is read is still the last *positional*, which a flag never is.
                const positionalOf = (list: string[]): string[] =>
                    list.filter(argument => !argument.startsWith('--'));
                // What the migration Job is run with, in full: the entry, the intent that does the work
                // and the intent that names the rc file it reads — `release` last, because the trailing
                // name is what picks that file (Phase 15 E) — and what a suite that names its own
                // intents keeps. The dev-only ones are dropped rather than honoured: a CR that names
                // `microservice` (every CR written before the split did — the CRD used to default to it)
                // would activate every layer of every realm the pod carries, turning a split deployment
                // into N monoliths, each opening the others' gateways and database connections (D-428).
                pin(assert, 'migrationArgs', {
                    args: argsOf({}),
                    custom: positionalOf(argsOf({intents: ['microservice', 'custom']})),
                    devOnly: positionalOf(argsOf({intents: ['dev', 'upgrade', 'release']})),
                });
                // The one property a snapshot states badly, because it is about the order rather than
                // the values: `minimist` reads `--marine.orchestrator release` as
                // `{marine: {orchestrator: 'release'}}`, so an intent written after a flag is swallowed
                // as that flag's value, and the step then ran without the deployment's config and
                // dialled the default `127.0.0.1:3306` while every pod around it connected (T-267).
                const args = argsOf({});
                assert.ok(args.length, 'the migration Job runs the suite entry with intents');
                const firstFlag = args.findIndex(argument => argument.startsWith('--'));
                assert.ok(
                    firstFlag === -1 ||
                        args.slice(firstFlag).every(argument => argument.startsWith('--')),
                    'while no positional follows a flag, whose value minimist would read it as',
                );

                // Every container the tree ships is sized, not only the ones a suite serves: a
                // container with no `resources` is BestEffort, and the steps around the processes —
                // the fill, seed and migration Jobs — had none while the processes beside them had
                // the plan's default. The
                // migration Job shipped that way from the day it existed (F-432), so the check is
                // over every pod spec a tree declares rather than over the one that was reported.
                const unsized = (tree: Map<string, unknown>): string[] => {
                    const findings: string[] = [];
                    for (const [path, resource] of tree) {
                        const spec = (
                            resource as {
                                spec?: {
                                    template?: {
                                        spec?: {
                                            containers?: Array<{
                                                name?: string;
                                                resources?: unknown;
                                            }>;
                                            initContainers?: Array<{
                                                name?: string;
                                                resources?: unknown;
                                            }>;
                                        };
                                    };
                                };
                            }
                        )?.spec?.template?.spec;
                        for (const container of [
                            ...(spec?.containers ?? []),
                            ...(spec?.initContainers ?? []),
                        ]) {
                            if (!container.resources)
                                findings.push(`${path}: ${container.name ?? 'unnamed'}`);
                        }
                    }
                    return findings;
                };
                assert.deepEqual(
                    unsized(plan({})),
                    [],
                    'the nodeLocal tree sizes its fill and migration steps',
                );
                assert.deepEqual(
                    unsized(plan({}, 'shared')),
                    [],
                    'and the shared one sizes the seed step beside the migration',
                );
            },

            async function aMonolithDispatchesInsideItsOnlyProcess(assert: IAssert) {
                // A monolith serves every namespace a call can name, so the tree says so on the command
                // line: `canSkipSocket` is what makes a call to a namespace this process serves resolve
                // in-process instead of opening a socket to a Service that is the caller itself. A realm
                // or layer profile is the opposite, which is why the setting belongs to the profile
                // rather than to the suite — spelled out in a suite config it stays true only until
                // somebody copies that config into a split tree, where the call that should have crossed
                // the network resolves locally and fails as a method nobody has (T-224). Both command
                // lines are pinned, because both carry it: the process and the migration step beside it.
                const plan = (profile: 'monolith' | 'realm'): IDeploymentPlan =>
                    lib.suitePlan({
                        profile,
                        suite: lib.pinnedSuite,
                        deployments: [
                            {
                                name: 'shop',
                                realms: ['shop'],
                                layers: ['shop.orchestrator'],
                                namespaces: ['shop'],
                                replicas: 1,
                            },
                        ],
                    }) as IDeploymentPlan;
                const containerArgs = (profile: 'monolith' | 'realm'): string[] => {
                    const deployment = buildKustomizeTree(plan(profile)).get(
                        'deployments/shop.yaml',
                    ) as {
                        spec?: {template?: {spec?: {containers?: Array<{args?: string[]}>}}};
                    };
                    return deployment?.spec?.template?.spec?.containers?.[0]?.args ?? [];
                };
                pin(assert, 'profileArgs', {
                    deployment: containerArgs('monolith'),
                    migration: migrationArgs(plan('monolith')),
                    realmDeployment: containerArgs('realm'),
                    realmMigration: migrationArgs(plan('realm')),
                });
            },

            async function aDeploymentBringsItsOwnServices(assert: IAssert) {
                // Phase 15 I: a deployment that activates a `knex` adapter brings a MySQL with it. The
                // descriptor says what the service *is* (its image, its port, its claim, the keys its
                // credentials are read by) and the base beside it says what only the image knows (the
                // chown init container, the environment, the probe); what the plan adds is the rest —
                // the namespace, the databases its connections named, the class its claim asks for.
                // The alias is the other half, and the reason a realm's config can keep naming
                // `mysql` rather than a host.
                const mysql = resolveBackingServices(loadServiceCatalog(), {
                    kinds: ['knex'],
                    databases: ['blong-suite', 'blong-access'],
                    namespace: 'shop-services',
                    storageClassName: 'local-path',
                }).services[0];
                assert.ok(mysql, 'the catalog carries the database the adapter needs');
                const plan = lib.suitePlan({
                    suite: lib.pinnedSuite,
                    backingServices: [mysql],
                }) as IDeploymentPlan;
                const tree = buildKustomizeTree(plan);
                pin(assert, 'backingService', {
                    files: [...tree.keys()].filter(
                        file =>
                            file.startsWith('services/mysql/') ||
                            file.startsWith('namespaces/shop-services'),
                    ),
                    workload: tree.get('services/mysql/deployment.yaml'),
                    claim: tree.get('services/mysql/claim.yaml'),
                    init: tree.get('services/mysql/init-config.yaml'),
                    credentials: tree.get('services/mysql/credentials.yaml'),
                    // The alias, in the *suite's* namespace: one name a realm's config already uses.
                    alias: tree.get('external-services/mysql.yaml'),
                });
                // Derived, not random: the tree is written again on every pass, and a password that
                // changed would be a service whose own users stopped matching the Secret beside it.
                assert.deepEqual(
                    buildKustomizeTree(plan).get('services/mysql/credentials.yaml'),
                    tree.get('services/mysql/credentials.yaml'),
                    'and the same plan writes the same credentials, pass after pass',
                );
            },

            async function aTreeThatCarriesTwoNamespacesNamesEachItsOwn(assert: IAssert) {
                // kustomize's `namespace:` is a rewrite rather than a default: it moves every
                // namespace-able object into it, overwriting the namespace the object declared, and
                // renames every Namespace object in the tree to it — so a tree with a second namespace
                // cannot carry the field at all, because the two Namespace objects collide and
                // `kustomize build` refuses to produce anything, which is how this was found (F-440).
                // What makes leaving the field out safe is a property of the tree rather than of the
                // field, so the property is what this step pins: every document the generator writes
                // names the namespace it belongs in, and both namespaces are created by the same
                // apply.
                const mysql = resolveBackingServices(loadServiceCatalog(), {
                    kinds: ['knex'],
                    databases: ['blong-suite'],
                    namespace: 'shop-services',
                }).services[0];
                const withService = buildKustomizeTree(
                    lib.suitePlan({
                        suite: lib.pinnedSuite,
                        backingServices: [mysql],
                    }) as IDeploymentPlan,
                );
                const root = withService.get('kustomization.yaml') as {namespace?: unknown};
                assert.equal(
                    root.namespace,
                    undefined,
                    'a tree with two namespaces writes no namespace field',
                );
                assert.deepEqual(
                    [...withService.values()]
                        .filter(
                            (document): document is Record<string, unknown> =>
                                typeof document === 'object' && document['kind'] === 'Namespace',
                        )
                        .map(document => (document['metadata'] as {name: string}).name)
                        .sort(),
                    ['shop-services', 'shop-suite'],
                    'and the same apply creates both, so the workload has somewhere to run',
                );
                // Cluster-scoped kinds carry no namespace by design; anything else that arrives
                // without one would be placed by whatever namespace the caller happens to be in.
                const clusterScoped = new Set([
                    'Namespace',
                    'ClusterRole',
                    'ClusterRoleBinding',
                    'CustomResourceDefinition',
                ]);
                assert.deepEqual(
                    [...withService]
                        .filter(
                            ([file, document]) =>
                                !file.endsWith('kustomization.yaml') &&
                                typeof document === 'object' &&
                                !clusterScoped.has(String(document['kind'])) &&
                                !(document['metadata'] as {namespace?: string}).namespace,
                        )
                        .map(([file]) => file),
                    [],
                    'no document leans on the kustomization to place it',
                );
                assert.equal(
                    (
                        buildKustomizeTree(
                            lib.suitePlan({suite: lib.pinnedSuite}) as IDeploymentPlan,
                        ).get('kustomization.yaml') as {namespace?: unknown}
                    ).namespace,
                    'shop-suite',
                    'while a tree that answers one namespace still names it',
                );
            },

            async function aServiceWithNoDatabasesStillWritesItsInitContainerFile(assert: IAssert) {
                // The *base* mounts the init ConfigMap, so the object has to exist whatever the plan
                // happens to know: a suite that names its database only in its release rc leaves the
                // planning view with none to name, and the workload then never starts —
                // `MountVolume.SetUp failed for volume "mysql-init": configmap "mysql-init-config" not
                // found` — which is a tree that reads complete and a pod stuck at `Init:0/1` (T-277).
                const mysql = resolveBackingServices(loadServiceCatalog(), {
                    kinds: ['knex'],
                    namespace: 'shop-services',
                }).services[0];
                assert.deepEqual(
                    mysql.databases,
                    [],
                    'a view that named no database resolves none',
                );
                const tree = buildKustomizeTree(
                    lib.suitePlan({
                        suite: lib.pinnedSuite,
                        backingServices: [mysql],
                    }) as IDeploymentPlan,
                );
                const init = tree.get('services/mysql/init-config.yaml') as {
                    metadata?: {name?: string};
                    data?: Record<string, string>;
                };
                assert.equal(
                    init?.metadata?.name,
                    'mysql-init-config',
                    'the ConfigMap the workload mounts is written',
                );
                assert.match(
                    String(init?.data?.['init.sql']),
                    /the plan named no database/,
                    'carrying a comment rather than a guess at one',
                );
                assert.match(
                    JSON.stringify(tree.get('services/mysql/deployment.yaml')),
                    /mysql-init-config/,
                    'and the workload mounts that name',
                );
            },

            async function aServiceWithNoBaseIsRefused(assert: IAssert) {
                // A descriptor whose base is missing has nothing to run. Refused where the tree is
                // built, naming the file, rather than generated into a claim, an alias and a namespace
                // for a workload that does not exist.
                assert.throws(
                    () =>
                        buildKustomizeTree(
                            lib.suitePlan({
                                backingServices: [
                                    {
                                        name: 'postgres',
                                        kinds: ['knex'],
                                        image: 'postgres:16',
                                        port: {name: 'postgres', port: 5432},
                                        namespace: 'shop-services',
                                        databases: ['blong-suite'],
                                    },
                                ],
                            }) as IDeploymentPlan,
                        ),
                    /services\/postgres\/base\/deployment\.yaml: a service the plan needs has no base/,
                    'the file it looked for is named',
                );
            },

            async function everyNamespaceTheResolverAsksForHasAService(assert: IAssert) {
                // `GatewayCodec` asks for `rpc-<namespace>` and `ResolutionK8s` answers with the
                // Service of the *namespace* name on the RPC port — while a bare service id resolves
                // to the same hostname on the gateway port. A realm Service covers the namespaces that
                // happen to be named after their realm, and nothing published the rest: a released
                // process calling `subject` died with `ENOTFOUND rpc-subject`, and the migration step
                // could not seed (F-413). Three things make the name usable, and one keeps it from
                // being written twice.
                const tree = buildKustomizeTree(
                    lib.suitePlan({
                        suite: lib.pinnedSuite,
                        deployments: [
                            {
                                name: 'core',
                                realms: ['srv', 'core'],
                                layers: ['srv.orchestrator', 'core.adapter'],
                                namespaces: ['subject', 'core'],
                                replicas: 1,
                            },
                            {
                                name: 'access',
                                realms: ['access'],
                                layers: ['access.adapter', 'access.orchestrator'],
                                namespaces: ['access'],
                                replicas: 1,
                            },
                        ],
                        services: [
                            {name: 'access', deployment: 'access'},
                            {name: 'core', deployment: 'core'},
                        ],
                    }),
                );

                const service = tree.get('services/subject.yaml') as {
                    spec?: {selector?: Record<string, string>; ports?: Array<{name: string}>};
                };
                const core = tree.get('deployments/core.yaml') as {
                    spec?: {template?: {metadata?: {labels?: Record<string, string>}}};
                };
                // The Service the resolver asks for and the label that answers it are one structure:
                // `rpc-<namespace>` is answered on the RPC port with the gateway port beside it, the
                // selector is the label the process carries, and a namespace named after its realm
                // keeps the Service that realm owns rather than gaining a second one under that name
                // (F-413).
                pin(assert, 'namespaceServices', {
                    service: service?.spec,
                    processLabels: core?.spec?.template?.metadata?.labels,
                    services: [...tree.keys()].filter(
                        path =>
                            path.startsWith('services/') && !path.endsWith('kustomization.yaml'),
                    ),
                });

                // The same plan is what makes the migration step self-contained: it carries every
                // selector the plan split across processes, so it seeds in-process rather than
                // dialling the processes it is about to start.
                const job = tree.get(
                    [...tree.keys()].find(
                        path =>
                            path.startsWith('deployer/') &&
                            path.endsWith('.yaml') &&
                            !path.endsWith('kustomization.yaml'),
                    ) ?? '',
                ) as {
                    spec?: {
                        template?: {
                            spec?: {
                                containers?: Array<{args?: string[]}>;
                                initContainers?: Array<{name?: string}>;
                            };
                        };
                    };
                };
                const args = job.spec?.template?.spec?.containers?.[0]?.args ?? [];
                // No selector in what the step is run with: the realms activate what a migration needs
                // themselves rather than dialling the processes it is about to start, and `release` is
                // still the trailing intent, which names the rc file it reads (T-268).
                pin(assert, 'migrationStep', {
                    args,
                    selectors: args.filter(argument => argument.startsWith('--')),
                    // The step runs code from a volume the prefetch replaces in place, and it has one
                    // attempt, so it waits for the marker a whole tree is written under before it
                    // starts (F-448). The neighbours are read as well, because an init container that
                    // *replaced* the wait would otherwise pass this: what is pinned is the list.
                    waits: (job.spec?.template?.spec?.initContainers ?? []).map(
                        container => container?.name,
                    ),
                });
            },

            async function everyReferenceInTheTreeResolves(assert: IAssert) {
                // A tree is a graph, and its failures are dangling edges: a mount with no volume, a
                // Service whose selector matches no pod, an Ingress whose backend names no Service.
                // Each shipped once and each was silent — a pod with an unmounted path runs, a
                // Service with no endpoints answers nothing, and the controller answers 503 for an
                // Ingress it cannot resolve. `danglingReferences` is the check; these are the two
                // halves it needs to be worth having: the tree this realm generates has no finding,
                // and each class is reported when it is broken (T-242).
                const plan = buildKustomizeTree(
                    lib.suitePlan({
                        suite: lib.pinnedSuite,
                        deployments: [
                            {
                                name: 'shop',
                                realm: 'shop',
                                realms: ['shop'],
                                layers: ['shop.orchestrator'],
                                namespaces: ['shop'],
                                replicas: 1,
                            },
                        ],
                        services: [{name: 'shop', namespace: 'shop-suite', deployment: 'shop'}],
                        portal: {web: {host: 'shop.example', deployment: 'shop'}},
                    }),
                );
                assert.deepEqual(
                    danglingReferences(plan),
                    [],
                    'the tree this realm generates resolves every reference it makes',
                );

                const pod = (mount: string): Record<string, unknown> => ({
                    apiVersion: 'apps/v1',
                    kind: 'Deployment',
                    metadata: {name: 'shop', namespace: 'shop-suite'},
                    spec: {
                        template: {
                            metadata: {labels: {'app.kubernetes.io/name': 'shop'}},
                            spec: {
                                volumes: [{name: 'suite', emptyDir: {}}],
                                containers: [{name: 'shop', volumeMounts: [{name: mount}]}],
                            },
                        },
                    },
                });
                const findings = (entries: Array<[string, unknown]>): string[] =>
                    danglingReferences(new Map(entries) as never);

                // Each class of dangling edge is reported with the path to the file it was found in, and
                // a mount that resolves is not reported at all — which is what makes the three findings
                // readings (T-242). The strings are the contract, so they are pinned rather than
                // matched one at a time.
                pin(assert, 'danglingReferences', {
                    resolved: findings([['deployments/shop.yaml', pod('suite')]]),
                    mount: findings([['deployments/shop.yaml', pod('missing')]]),
                    selector: findings([
                        ['deployments/shop.yaml', pod('suite')],
                        [
                            'services/other.yaml',
                            {
                                apiVersion: 'v1',
                                kind: 'Service',
                                metadata: {name: 'other', namespace: 'shop-suite'},
                                spec: {selector: {'app.kubernetes.io/name': 'other'}},
                            },
                        ],
                    ]),
                    ingress: findings([
                        [
                            'ingresses/shop.yaml',
                            {
                                apiVersion: 'networking.k8s.io/v1',
                                kind: 'Ingress',
                                metadata: {name: 'shop', namespace: 'shop-suite'},
                                spec: {
                                    rules: [
                                        {
                                            http: {
                                                paths: [
                                                    {path: '/', backend: {service: {name: 'gone'}}},
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    ]),
                });
            },

            async function theVersionLabelIsTheSuitesOwn(assert: IAssert) {
                // The label answers "which build is deployed", so it is the suite's version and not the
                // framework's, and it is *found* rather than required: a suite's config may pin it, and
                // a tree that has no suite config — the operator's own install, which runs from this
                // realm's package — labels its objects with the package the generator runs from. One
                // field used to answer for both versions, which made every deployment report the
                // `blong-gogo` it was built against as if it were the application.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-version-'));
                try {
                    const realm = JSON.parse(
                        readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
                    ) as {version: string};
                    const plan = (suite: Record<string, unknown>) =>
                        buildKustomizeTree(
                            lib.suitePlan({
                                suite: {
                                    minFrameworkVersion: '1.2.3',
                                    entry: join(dir, 'index.ts'),
                                    ...suite,
                                },
                            }),
                        );
                    // The tree holds objects at this stage — `serializeKustomizeTree` renders them — so
                    // the label is read where it will be written from, not out of a string.
                    const versionOf = (tree: Map<string, unknown>) =>
                        (
                            tree.get('namespaces/shop-suite.yaml') as {
                                metadata?: {labels?: Record<string, string>};
                            }
                        )?.metadata?.labels?.['app.kubernetes.io/version'];

                    // The label answers "which build is deployed", so it is the suite's version when the
                    // suite names one and the package the generator runs from when it names none — and
                    // never the framework version it was built against, which one field used to answer
                    // for as well.
                    pin(assert, 'versionLabels', {
                        realm: realm.version,
                        unversioned: versionOf(plan({})),
                        declared: versionOf(plan({version: '9.8.7'})),
                    });
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aVolumeIsNamedAfterItsArtifact(assert: IAssert) {
                // What names a volume is the artifact rather than the version: a rebuild that ships
                // different files under an unchanged version is a *new* directory, which is what stops
                // a reader from being attached to a tree that is being rewritten (D-468, D-469). A
                // digest is kept as its own prefix — a reader can check the eight characters against
                // the archive — while a stamp is hashed into the same shape, because eight characters
                // of a timestamp are either too coarse for one day or not comparable across a year.
                // An artifact that names neither falls back to the version, which is what a caller that
                // has not been taught to stamp still gets.
                const base = (lib.suitePlan() as IDeploymentPlan).suiteVolume;
                const identity = (artifact?: IDeploymentPlan['suiteVolume']['artifact']): string =>
                    volumeIdentity(
                        lib.suitePlan({
                            suite: {version: '1.2.3'},
                            suiteVolume: {...base, artifact},
                        }),
                    );
                pin(assert, 'volumeIdentity', {
                    fromDigest: identity({
                        source: 'url',
                        url: 'http://artifacts.test/suite.zip',
                        digest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
                    }),
                    fromStamp: identity({
                        source: 'path',
                        path: '/tmp/shop-suite',
                        deployedAt: '2026-10-09T14:30:00Z',
                    }),
                    unnamed: identity({source: 'url', url: 'http://artifacts.test/suite.zip'}),
                    absent: identity(undefined),
                });
            },

            async function objectsAreFingerprinted(
                assert: IAssert,
                {
                    treeIsReproducible: generated,
                }: {
                    treeIsReproducible: Promise<{dir: string; files: string[]}>;
                },
            ) {
                const {dir, files} = await generated;
                try {
                    const read = (file: string) => readFileSync(join(dir, file), 'utf8');

                    // Every generated object carries the hash of itself, which is what
                    // lets a later reconcile tell "changed" from "already like this".
                    // The role is looked up rather than named: the file is named after the
                    // suite, and the suite's name is the deployment's business, not this
                    // test's.
                    const role = files.find(
                        file => file.startsWith('rbac/') && file.endsWith('-role.yaml'),
                    );
                    assert.ok(role, 'the tree carries the read-only role the UI runs under');
                    assert.match(
                        read(role as string),
                        /blong\.feasible\.one\/spec-hash/,
                        'generated objects carry a spec fingerprint',
                    );
                    // The kustomization files are build instructions, not objects: a
                    // fingerprint on them would change on every unrelated edit and mean
                    // nothing to the cluster.
                    const kustomization = read('kustomization.yaml');
                    assert.doesNotMatch(
                        kustomization,
                        /spec-hash/,
                        'the kustomization files carry no fingerprint',
                    );

                    // The whole tree is pinned, not a sample of it: generation is a pure
                    // function of the plan, so any change to the output is a change to what a
                    // cluster receives, and the snapshot is where that becomes visible.
                    // The other half of the assert API is exercised here too: `matchSnapshot`
                    // compares against a stored snapshot (T-205).
                    if (typeof assert.matchSnapshot === 'function') {
                        assert.matchSnapshot(files.length, 'generatedFileCount');
                    }
                    pin(
                        assert,
                        'generatedTree',
                        Object.fromEntries(files.map(file => [file, read(file)])),
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function theTreeCarriesWhatARealmDeclares(assert: IAssert) {
                // The folders that appear only on demand (T-207) and a volume a realm owns
                // (T-208): a claim named after the volume, mounted by the process that asked for
                // it, and a secret that refers to a file rather than carrying a value.
                const plan = lib.suitePlan({
                    deployments: [
                        {
                            name: 'shop',
                            realms: ['shop'],
                            layers: [],
                            namespaces: [],
                            replicas: 1,
                            volumes: [{name: 'shop-data', size: '1Gi', mountPath: '/var/lib/shop'}],
                        },
                    ],
                    secrets: [{name: 'shop-db', envs: ['shop-db.env']}],
                    assets: [{name: 'shop-ui', files: ['ui/index.html']}],
                    crd: false,
                }) as IDeploymentPlan;

                const tree = buildKustomizeTree(plan);
                const files = [...tree.keys()];
                const deployment = tree.get('deployments/shop.yaml') as {
                    spec?: {
                        template?: {
                            spec?: {
                                containers?: Array<{volumeMounts?: unknown}>;
                                volumes?: unknown;
                            };
                        };
                    };
                };
                // The folders that appear only on demand (T-207) and a volume a realm owns (T-208): a
                // claim named after the volume, mounted by the process that asked for it at the path
                // it asked for, and a secret that refers to a file rather than carrying a value.
                pin(assert, 'realmDeclarations', {
                    generatedFolders: files.filter(
                        path =>
                            path.endsWith('kustomization.yaml') &&
                            (path.startsWith('secrets/') || path.startsWith('assets/')),
                    ),
                    volumes: files.filter(path => path.startsWith('volumes/')),
                    secret: tree.get('secrets/kustomization.yaml'),
                    mounted: deployment?.spec?.template?.spec?.volumes,
                    mounts: deployment?.spec?.template?.spec?.containers?.map(
                        container => container.volumeMounts,
                    ),
                });
            },

            async function theOperatorIsInstalledOnceForTheCluster(assert: IAssert) {
                // One operator per cluster, installed before any suite (D-396, D-397): its own tree
                // carries the Deployment, its cluster-scoped rights and the CRD, while a suite's tree
                // carries the bindings it grants in its own namespace and its CR.
                const suite = lib.suitePlan({
                    operator: resolveSuiteOperator({intervalSeconds: 30}),
                    crd: true,
                }) as unknown as Record<string, unknown>;
                const files = [...buildKustomizeTree(suite as never).keys()];
                const operator = buildKustomizeTree(lib.installPlan(suite));
                const install = [...operator.keys()];
                const answer = operator.get('services/blong-operator.yaml') as {
                    spec?: {selector?: unknown; ports?: unknown};
                };
                const deployment = operator.get('deployments/blong-operator.yaml') as {
                    spec?: {template?: {spec?: {initContainers?: Array<{name?: string}>}}};
                };
                // The operator serves its own deployment UI, and that UI's login is the realm's
                // cluster-backed one: it asks the cluster who a caller is (`TokenReview`) and what that
                // identity may do (`SubjectAccessReview`). Without the two rules here the portal answers
                // `k8s.forbidden` while every other part of the install works, and the tenant's own
                // `auth-review` role does not cover the operator's identity — it is bound to the
                // suite's (F-430). The two roles share one list (`AUTH_REVIEW_RULES`), and this is the
                // half that states the operator's own need.
                const clusterRole = operator.get('rbac/blong-operator-clusterrole.yaml') as {
                    rules: Array<{resources: string[]; verbs: string[]}>;
                };
                // The address the read API answers on is the installer's to name (D-434), and nothing
                // invents one: a host is a DNS record and a certificate somebody has to own, so an
                // install tree with no named host carries the Service and no Ingress at all.
                const addressed = buildKustomizeTree(
                    lib.installPlan({
                        ...suite,
                        // The install tree's own namespace, which is what an installer names it: the
                        // Ingress lands in it because an Ingress cannot reach across namespaces.
                        suite: {
                            name: 'blong-operator',
                            namespace: 'blong-system',
                            frameworkImage: 'blong',
                        },
                        operator: resolveSuiteOperator({
                            intervalSeconds: 30,
                            ingress: {host: 'blong-operator.test'},
                        }),
                    }),
                );
                // One operator per cluster, installed before any suite (D-396, D-397): the suite's tree
                // ships no operator and no cluster-scoped CRD of its own and grants the operator its
                // rights in its own namespace instead, while the install tree carries the operator, the
                // CRD, the address the deployment read API answers at — both surfaces, selected by the
                // operator's own labels so another namespace's operator is not it — and none of the
                // suite's objects, which is what keeps the two trees from being confused for one
                // another (T-258).
                pin(assert, 'operatorInstall', {
                    suiteFiles: files,
                    installFiles: install,
                    selector: answer?.spec?.selector,
                    ports: answer?.spec?.ports,
                    // The operator runs its own entry from the volume the prefetch replaces in place, so
                    // it waits for the marker a whole tree is written under. Pinned because the operator
                    // Deployment has its own builder rather than the suite's, which is exactly how the
                    // gate was first left out of it (F-448).
                    waits: (deployment?.spec?.template?.spec?.initContainers ?? []).map(
                        container => container?.name,
                    ),
                    authReview: clusterRole.rules
                        .filter(rule =>
                            rule.resources.some(resource =>
                                ['tokenreviews', 'subjectaccessreviews'].includes(resource),
                            ),
                        )
                        .map(rule => [rule.resources[0], rule.verbs]),
                    addressedIngress: addressed.get('ingresses/blong-operator-test.yaml'),
                });
            },

            async function theOperatorEntryIsWhereItsArtifactPutsIt(assert: IAssert) {
                // The entry inside an artifact is the file's path *in the repository* under the mount,
                // because `rush deploy` mirrors the category folders — the suite's entry carries its
                // own (`suite/blong-suite/index.ts`) for the same reason. The install tree is written
                // from the realm's own config (`operator-entry.ts`), so a path that is short by one
                // folder is only visible against a real artifact: it named
                // `/opt/deploy/suite/operator-entry.ts`, no artifact has that file, and the operator
                // exited with "No entry point found in /opt/deploy" (F-404). The check is static
                // because the file is a suite definition rather than a value a test can import
                // cheaply, and the rule it asserts is what the failure was about.
                const here = fileURLToPath(import.meta.url);
                const entryFile = join(dirname(here), '../../../operator-entry.ts');
                const declared = readFileSync(entryFile, 'utf8');
                const entry = /entry: `\$\{SUITE_MOUNT\}\/([^`]+)`/.exec(declared);
                assert.ok(entry, 'the operator names its own entry, with the mount');
                // The repository root, so the expectation is the path the artifact mirrors rather
                // than a string that has to be kept in step by hand.
                let repoRoot = dirname(here);
                while (!existsSync(join(repoRoot, 'rush.json'))) {
                    const up = dirname(repoRoot);
                    assert.notEqual(up, repoRoot, 'the repository root is found above the test');
                    repoRoot = up;
                }
                assert.equal(
                    entry![1],
                    relative(repoRoot, entryFile).split(sep).join('/'),
                    'and it is the path of that file in the repository, which is where the artifact holds it',
                );
            },

            async function theCrOnlySaysWhatItsCrdDeclares(assert: IAssert) {
                // The CR is written by the generator and the CRD beside it, so a field the
                // planner emits and the schema does not declare is a failed apply: `kubectl`
                // validates strictly, and the API server refuses a field a structural schema
                // does not know (T-221 — the external-service ports and the artifact source
                // were rejected exactly like that). Walking the emitted CR against the emitted
                // schema keeps the two in step with no cluster in the loop.
                const plan = lib.suitePlan({
                    suite: {
                        version: '7',
                        minFrameworkVersion: '1',
                        entry: '/opt/deploy/suite/suite/shop/index.ts',
                        intents: ['microservice'],
                    },
                    externalServices: [
                        {
                            name: 'db',
                            externalName: 'mysql.db.svc.cluster.local',
                            ports: [{name: 'mysql', port: 3306}],
                        },
                    ],
                    portal: {
                        shop: {
                            realm: 'shop',
                            host: 'shop.example',
                            path: '/shop',
                            auth: {type: 'oauth2', authUrl: 'https://id.example'},
                            deployment: 'shop',
                        },
                    },
                    // Both shapes of a service switch travel with the CR: a service a deployment runs
                    // itself, and one whose image it pins. The operator regenerates the tree from the
                    // declaration, so a switch the CRD does not declare is a service that comes back
                    // on the next pass.
                    backingServiceRequest: {
                        services: {
                            mysql: false,
                            mongodb: {image: 'mongo:7.0', storage: {size: '4Gi'}},
                        },
                        servicesNamespace: 'shop-services',
                        storageClassName: 'local-path',
                    },
                    // The artifact the suite is fetched from, rather than a volume the cluster
                    // fills: what the CR names and the tree mounts has to be one volume.
                    suiteVolume: lib.artifactVolume,
                    crd: true,
                }) as IDeploymentPlan;

                const tree = buildKustomizeTree(plan);
                const install = buildKustomizeTree(lib.installPlan(plan));
                assert.ok(
                    install.has('crd/blongdeployment-crd.yaml'),
                    'the install tree carries the CRD',
                );
                assert.ok(
                    tree.has('blongdeployment.yaml'),
                    'and a suite tree asks the operator for this suite',
                );

                const asRecord = (value: unknown): Record<string, unknown> =>
                    typeof value === 'object' && value !== null
                        ? (value as Record<string, unknown>)
                        : {};
                const crd = asRecord(install.get('crd/blongdeployment-crd.yaml'));
                const cr = asRecord(tree.get('blongdeployment.yaml'));
                const versions = crd.spec === undefined ? undefined : asRecord(crd.spec).versions;
                const version = asRecord(Array.isArray(versions) ? versions[0] : undefined);
                const schema = asRecord(asRecord(version.schema).openAPIV3Schema);
                const spec = asRecord(asRecord(schema.properties).spec);

                // Every path the CR names has to resolve to a declared property, and every
                // value under an enum has to be one of its members.
                const walk = (node: unknown, value: unknown, path: string): string[] => {
                    if (node === undefined) return [`${path} is not declared`];
                    if (value === undefined || value === null) return [];
                    const current = asRecord(node);
                    // A value the schema deliberately leaves unconstrained — `services.<name>` is
                    // either a boolean or an override, a union Kubernetes will not let a CRD write
                    // down — is accepted whatever it holds. The realm checks the shape where it reads
                    // it, which is the pass that can name the wrong key.
                    if (current['x-kubernetes-preserve-unknown-fields'] === true) return [];
                    if (Array.isArray(value)) {
                        return value.flatMap((item, index) =>
                            walk(current.items, item, `${path}[${index}]`),
                        );
                    }
                    if (typeof value === 'object') {
                        const properties = asRecord(current.properties);
                        return Object.entries(value as Record<string, unknown>).flatMap(
                            ([key, item]) =>
                                walk(
                                    // A map is declared once, by `additionalProperties`: the CR
                                    // carries keys a schema cannot enumerate — a portal per alias,
                                    // a group per name — so a key the CRD does not name is the
                                    // shape working, not a field it failed to declare.
                                    properties[key] ?? current.additionalProperties,
                                    item,
                                    `${path}.${key}`,
                                ),
                        );
                    }
                    const allowed = current.enum;
                    if (Array.isArray(allowed) && !allowed.includes(value)) {
                        return [`${path} is ${String(value)}, not one of ${allowed.join(', ')}`];
                    }
                    return [];
                };

                assert.deepEqual(
                    walk(spec, cr.spec, 'spec'),
                    [],
                    'every field the generator writes into the CR is one the CRD declares',
                );

                // The same walk over the status, and it matters more than the spec one: the API
                // server rejects an unknown spec field but _prunes_ an unknown status field, so a
                // report the operator writes can go missing in silence — `phase` and `lastResult`
                // did, against a cluster still holding the older CRD.
                const status = asRecord(asRecord(schema.properties).status);
                assert.deepEqual(
                    walk(
                        status,
                        {
                            phase: 'Ready',
                            observedVersion: '1',
                            message: '0 created, 0 updated, 18 unchanged',
                            deployments: [{name: 'shop', available: 1}],
                            lastResult: {
                                at: '2026-10-05T00:00:00.000Z',
                                created: 0,
                                updated: 0,
                                unchanged: 18,
                                obsolete: 0,
                                failures: 0,
                            },
                        },
                        'status',
                    ),
                    [],
                    'every field the operator reports is one the CRD declares',
                );
                // And the phase is a printer column, because that is the question `kubectl get bdep`
                // is asked, and a status nobody sees is a status nobody reads.
                const columns = version.additionalPrinterColumns;
                assert.ok(
                    Array.isArray(columns) &&
                        columns.some(column => asRecord(column).jsonPath === '.status.phase'),
                    'the phase is a printer column',
                );
            },

            async function theChildIsAskedForATreeAPassCanApply(assert: IAssert) {
                // The two paths a CR pass takes, and the one argument that differs: an artifact that
                // ships the base gets the overlay written beside it, and one that does not gets the
                // tree whole. Neither leaves that to a default, because the default a repository
                // wants is a design half and a pass applies what it reads back (D-490).
                const args = (base: boolean): string[] =>
                    suiteGenerateArgs({
                        entry: '/cache/blong-suite/index.ts',
                        specFile: '/tmp/blong-suite-spec.json',
                        outputDir: '/tmp/blong-suite',
                        base,
                    });
                assert.ok(
                    args(true).includes('--kustomize.deploy.layout=local'),
                    'an artifact with a base is asked for the overlay alone',
                );
                assert.ok(
                    args(false).includes('--kustomize.deploy.layout=flat'),
                    'an artifact without one is asked for the tree whole, never a default',
                );
                assert.ok(
                    args(true).includes('--kustomize.deploy.specFile=/tmp/blong-suite-spec.json') &&
                        args(true).includes('--kustomize.deploy.outputDir=/tmp/blong-suite'),
                    'and both paths carry the spec to plan from and the directory to write',
                );
            },

            async function theRetentionCountsVolumeJobsPerNode(assert: IAssert) {
                // Two numbers, two rules (D-471): a fill Job carries the *volume* retention and is
                // counted per node, because the directory it fills is a node's own — three means three
                // identities on that node, the current one included — while an attempt carries its own
                // and is counted with the attempts of its step.
                const agent = 'k3d-dev-cluster-agent-0';
                const server = 'k3d-dev-cluster-server-0';
                const fillJob = (identity: string, node: string, at: string) => ({
                    kind: 'Job',
                    metadata: {
                        name: `blong-suite-fill-1.13.0-${identity}-${node}`,
                        namespace: 'blong-suite',
                        creationTimestamp: at,
                        labels: {'blong.feasible.one/retention': '3'},
                    },
                    // The node the count is per: read off the selector, because the name cannot be
                    // split — both the identity and a hostname carry hyphens.
                    spec: {template: {spec: {nodeSelector: {'kubernetes.io/hostname': node}}}},
                });
                const obsolete = [
                    // Four identities on the agent node and three on the server, oldest first.
                    fillJob('aaaaaaaa', agent, '2026-10-10T10:00:00Z'),
                    fillJob('bbbbbbbb', agent, '2026-10-10T11:00:00Z'),
                    fillJob('cccccccc', agent, '2026-10-10T12:00:00Z'),
                    fillJob('dddddddd', agent, '2026-10-10T13:00:00Z'),
                    fillJob('aaaaaaaa', server, '2026-10-10T10:00:00Z'),
                    fillJob('bbbbbbbb', server, '2026-10-10T11:00:00Z'),
                    fillJob('cccccccc', server, '2026-10-10T12:00:00Z'),
                ];
                const doomed = fillJobsPastRetention(obsolete as never, 3).map(
                    object => object.metadata?.name,
                );
                assert.deepEqual(
                    doomed.sort(),
                    [
                        `blong-suite-fill-1.13.0-aaaaaaaa-${agent}`,
                        `blong-suite-fill-1.13.0-aaaaaaaa-${server}`,
                        `blong-suite-fill-1.13.0-bbbbbbbb-${agent}`,
                    ],
                    'the volume retention is kept per node, three identities on each',
                );
                const oneAttempt = {
                    kind: 'Job',
                    metadata: {
                        name: 'blong-suite-migrate-1.13.0-12345678-abcdef01',
                        namespace: 'blong-suite',
                        creationTimestamp: '2026-10-10T09:00:00Z',
                        labels: {'blong.feasible.one/attempt-retention': '2'},
                    },
                };
                const both = jobsPastRetention([oneAttempt as never, ...(obsolete as never[])]).map(
                    object => object.metadata?.name,
                );
                assert.ok(
                    both.includes('blong-suite-migrate-1.13.0-12345678-abcdef01') === false,
                    'an attempt two-deep is inside its own retention and is left alone',
                );
                assert.deepEqual(
                    both.sort(),
                    doomed.sort(),
                    'while the fill Jobs are retired by their label, not by the attempt number',
                );
            },

            async function theInstallSweepSelectsOnTheRetentionLabels(assert: IAssert) {
                // The install namespace is the one place a pass deletes outside the suite's own
                // (D-491), and it holds objects the operator may not touch: its own RBAC, its
                // Deployment, the Service in front of it. What keeps the sweep off them is that it
                // selects on the retention labels and nothing else — no name, no kind, no position in
                // a list — so an object that does not say how long to keep it is never a candidate.
                const volume = {
                    kind: 'Job',
                    metadata: {
                        name: 'blong-operator-fill-1.13.0-aaaaaaaa-k3d-dev-cluster-server-0',
                        namespace: 'blong-system',
                        labels: {[VOLUME_RETENTION_LABEL]: '3'},
                    },
                };
                const attempt = {
                    kind: 'Job',
                    metadata: {
                        name: 'blong-operator-migrate-1.13.0-12345678-abcdef01',
                        namespace: 'blong-system',
                        labels: {[ATTEMPT_RETENTION_LABEL]: '2'},
                    },
                };
                const installOwned = {
                    kind: 'Role',
                    metadata: {
                        name: 'blong-operator',
                        namespace: 'blong-system',
                        labels: {app: 'blong-operator'},
                    },
                };

                assert.ok(
                    hasRetentionLabel(volume as never),
                    'a fill Job says how many volume directories to keep',
                );
                assert.ok(
                    hasRetentionLabel(attempt as never),
                    'and an attempt says how many attempts to keep',
                );
                assert.ok(
                    hasRetentionLabel(installOwned as never) === false,
                    'while an object that keeps no count is left where the install put it',
                );
            },
        ]),
}));
