import {library} from '@feasibleone/blong';
import type {IDeploymentPlan} from '../../../plan.ts';
import {resolveSuiteOperator, resolveSuiteVolume} from '../../../plan.ts';

/**
 * _fixtures.ts — the plans the tree tests are written against.
 *
 * A plan literal is fourteen lines of fields no step is *about*: the profile, the seven empty
 * collections, a volume, an operator, `install`. Twelve steps carried their own copy of it, so the
 * data that decides what a tree looks like was spread across the spec — and two steps could only be
 * compared field by field before anything they asserted could be read.
 *
 * A `library()` rather than a bare module, because the loader reads this file the way it reads the
 * group's handlers: a code file in a handler-group folder has to answer with something it can
 * classify, and a library is the shape a module of values has (the repository's `_lib.ts` files are
 * the same shape). The steps take it from `lib`, like any other injected helper.
 */
/**
 * The suite fields a *stable* tree needs pinned.
 *
 * The version and the entry are pinned so a tree does not change with the realm's own
 * `package.json`; the database is in here because the migration step is what most of these steps
 * are about. A step that wants something else spreads this and says what it changes.
 */
const pinnedSuite = {
    version: '9.9.9',
    minFrameworkVersion: '1',
    entry: '/opt/deploy/suite/index.ts',
    database: true,
};

/**
 * A plan for one suite, in the namespace these tests deploy into.
 *
 * `suite` merges over the defaults, so a step adds a version or a database to them, while every
 * other field *replaces* its default: a step that wants the shared backend passes
 * `suiteVolume: sharedVolume`, because a merged volume would be neither backend.
 *
 * The parameter is an `object` rather than a `Record`: an interface has no index signature, so a
 * caller holding an `IDeploymentPlan` could not hand it back to this function.
 */
const suitePlan = (overrides: object = {}): IDeploymentPlan => {
    const {suite, ...rest} = overrides as {suite?: object} & Record<string, unknown>;
    return {
        suite: {
            name: 'shop',
            namespace: 'shop-suite',
            frameworkImage: 'blong',
            ...(suite as object),
        },
        profile: 'realm',
        deployments: [],
        services: [],
        // The third-party services a deployment brings with it: empty unless a step asks for one, and
        // present because a plan's shape is what the generator reads (Phase 15 I).
        backingServices: [],
        // What it asked for about them, which is what the CR carries so the operator decides the same
        // on its own pass.
        backingServiceRequest: {},
        externalServices: [],
        ingresses: [],
        manifests: [],
        secrets: [],
        assets: [],
        portal: {},
        suiteVolume: resolveSuiteVolume({backend: 'nodeLocal'}),
        // Two nodes on purpose: a `nodeLocal` volume is one directory per node, so a fixture with one
        // node would pin a tree that cannot show the per-node part of it — and the live cluster the
        // assertions run against has two.
        nodes: ['node-a', 'node-b'],
        operator: resolveSuiteOperator({}),
        install: false,
        ...rest,
    } as unknown as IDeploymentPlan;
};

/** The tree a cluster is given once: the operator, its cluster-scoped rights and the CRD (D-397). */
const installPlan = (overrides: object = {}): IDeploymentPlan =>
    suitePlan({...overrides, install: true});

const nodeLocalVolume = resolveSuiteVolume({backend: 'nodeLocal'});
const sharedVolume = resolveSuiteVolume({backend: 'shared'});
/**
 * The volume a *released* artifact is fetched into, rather than one the cluster fills (T-221).
 *
 * The CR names the source and the tree mounts what it unpacks, so the two have to be one volume; it
 * is here rather than in the step because which suite is fetched is not what the step is about.
 */
const artifactVolume = resolveSuiteVolume({
    backend: 'nodeLocal',
    artifact: {source: 'url', url: 'http://artifact/suite.zip'},
});

export default library(() => ({
    pinnedSuite,
    /** The volume the plans here start from, and the one that swaps the cache for a claim and a seed. */
    nodeLocalVolume,
    sharedVolume,
    artifactVolume,
    suitePlan,
    installPlan,
}));
