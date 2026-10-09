import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import type {
    IDeploymentPlan,
    IPlanOptions,
    IRegistryView,
    IResolvedPortalMap,
} from '../../../plan.ts';
import {planFromRegistry, planOptionsFromSpec, registryView} from '../../../plan.ts';

/**
 * The nodes the plan is derived for.
 *
 * A `nodeLocal` volume is one directory per node, so a plan without nodes is a plan whose tree cannot
 * be written — and a unit test has no cluster to ask (D-470).
 */
const NODES = ['node-a', 'node-b'];

/**
 * server/test/test/testPlanFind.ts — the plan derived from the loaded registry.
 *
 * This is the half of the realm that needs no cluster: `kustomize.plan.find` reads the
 * registry the process already loaded and says what the suite looks like as Kubernetes
 * objects. The assertions are the realm's contract with a deployment — a namespace, at
 * least one process, a Service for every orchestrator namespace, and the operator's
 * identity present but its Deployment off until asked for.
 *
 * Registered as the `test.plan.find` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {kustomizePlanFind}}) => ({
    testPlanFind: ({name = 'plan find'}: {name?: string} = {}) =>
        group(name)([
            async function planDescribesTheSuite(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const plan = (await kustomizePlanFind({nodes: NODES}, $meta)) as IDeploymentPlan;

                assert.ok(plan.suite?.name, 'the plan names the suite');
                assert.ok(plan.suite?.namespace, 'the plan names a namespace to deploy into');
                assert.ok(
                    plan.deployments.length > 0,
                    'the plan places the loaded realms in at least one process',
                );
                assert.ok(
                    plan.deployments.every(deployment => deployment.replicas > 0),
                    'every process asks for at least one replica',
                );
                assert.ok(
                    plan.deployments.every(
                        deployment =>
                            deployment.resources?.requests?.cpu &&
                            deployment.resources?.limits?.cpu &&
                            deployment.resources?.limits?.memory,
                    ),
                    'and every process is sized in both directions, so neither a BestEffort ' +
                        'container nor an unlimited CPU limit reaches the cluster',
                );
                assert.ok(
                    plan.services.some(service => service.name === 'kustomize'),
                    'the realm own orchestrator namespace gets a Service',
                );
                assert.ok(
                    !plan.services.some(service => service.name === 'srv'),
                    'while a companion realm owns no Service of its own — a role no suite states, ' +
                        'because the realm that is repeated by every process declares it (D-433)',
                );
                return plan;
            },

            async function aRealmDeclaresItsOwnRole(assert: IAssert) {
                // What each realm *is* in a deployment used to be the suite's answer, which meant the
                // suite had to know about realms it does not own and had to spell one realm twice when
                // it was loaded under two names. The realm answers now, in its own `server.ts` config:
                // the loader records it per realm and `describe()` publishes it (D-433).
                const view = registryView({
                    describe: () => ({
                        realms: ['srv', 'core', 'blong'],
                        ports: ['marine.payment'],
                        groups: [],
                        folders: [],
                        files: [],
                        layerFiles: [],
                        realmConfig: {
                            srv: {k8s: {k8sRealmRole: 'companion'}},
                            core: {k8s: {k8sRealmRole: 'both'}},
                            blong: {k8s: {k8sRealmRole: 'none'}},
                        },
                    }),
                });

                assert.deepEqual(
                    view.roles,
                    {srv: 'companion', core: 'both', blong: 'none'},
                    'each realm is what its own config says it is',
                );
                assert.equal(
                    view.roles.marine,
                    undefined,
                    'a realm that says nothing keeps the default of a service of its own,',
                );
                assert.equal(
                    view.roles.payment,
                    undefined,
                    'and a realm name that only appears as a port namespace is not a declaration',
                );
            },

            async function theOperatorIsAnotherTree(
                assert: IAssert,
                {planDescribesTheSuite}: {planDescribesTheSuite: Promise<IDeploymentPlan>},
            ) {
                // A suite tree carries the operator's *bindings* and its own CR; the operator itself,
                // and the CRD, come from that one tree a cluster is given once (Phase 15 A). So what a
                // plan says about the operator is its replicas and interval — never "is it emitted".
                const resolved = await planDescribesTheSuite;
                assert.equal(
                    resolved.operator?.replicas,
                    1,
                    'the operator asks for a single replica by default',
                );
                assert.equal(resolved.install, false, 'and a suite plan is not an install tree');
            },

            async function planIsDeterministic(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const first = (await kustomizePlanFind({nodes: NODES}, $meta)) as IDeploymentPlan;
                const second = (await kustomizePlanFind({nodes: NODES}, $meta)) as IDeploymentPlan;
                assert.equal(
                    JSON.stringify(first),
                    JSON.stringify(second),
                    'two reads of the same registry produce the same plan',
                );
                // Pinned, not just compared with itself: the shape of a plan is what a
                // deployment is built from, so a field that appears, disappears or changes
                // meaning should fail here rather than in a cluster. Guarded, because the dev
                // server's watch runner executes these same groups without a snapshot context
                // (T-214).
                if (typeof assert.snapshot === 'function') assert.snapshot(first, 'plan');
            },

            async function aCrOverridesOnlyWhatItNames(assert: IAssert) {
                // The CR-driven plan (T-210): a `BlongDeployment` carries inputs, and the fields
                // it leaves out have to stay with the config rather than falling to a default,
                // or a CR that mentions its volume would quietly undo a suite's choice. The suite's
                // *name* is the exception, and not through this mapping: it is the CR's own
                // `metadata.name`, which the operator reads off the object (Q4).
                const options = planOptionsFromSpec({profile: 'group'});
                assert.equal(options.profile, 'group', 'a granularity in the CR reaches the plan');
                assert.equal(
                    Object.prototype.hasOwnProperty.call(options, 'suiteName'),
                    false,
                    'while the name is never asked of the spec',
                );
                assert.equal(
                    Object.prototype.hasOwnProperty.call(options, 'frameworkImage'),
                    false,
                    'a field the CR does not name is left to the config',
                );
                assert.deepEqual(planOptionsFromSpec(), {}, 'an empty spec asks for nothing');
            },

            async function aRealmSizesItsOwnProcess(assert: IAssert) {
                // A realm that knows what its process needs says so in the port it contributes, and
                // the contribution is merged over the default rather than replacing it: a realm that
                // raises the memory limit has no opinion about the CPU request, and losing the default
                // because one field was named is the mistake this asserts against.
                const view = {
                    realms: ['srv', 'marine'],
                    groups: [
                        {name: 'srv.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'marine.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                    ],
                    ports: [
                        {id: 'srv.subject', type: 'dispatch', namespace: 'srv'},
                        {
                            id: 'marine.payment',
                            type: 'dispatch',
                            namespace: 'marine',
                            k8s: {
                                k8sResources: {
                                    requests: {memory: '256Mi'},
                                    limits: {memory: '2Gi'},
                                },
                            },
                        },
                    ],
                    roles: {},
                } as IRegistryView;
                const plan = planFromRegistry(view, {suiteName: 'demo', frameworkImage: 'image'});
                const of = (name: string) =>
                    plan.deployments.find(deployment => deployment.name === name);
                assert.deepEqual(
                    of('marine')?.resources,
                    {requests: {cpu: '50m', memory: '256Mi'}, limits: {cpu: '1', memory: '2Gi'}},
                    'the realm that named its needs keeps the default it did not name',
                );
                assert.deepEqual(
                    of('srv')?.resources,
                    {requests: {cpu: '50m', memory: '128Mi'}, limits: {cpu: '1', memory: '512Mi'}},
                    'and a realm that named nothing is sized by the default alone',
                );
            },

            async function theProfileDecidesTheSplit(assert: IAssert) {
                // The profile _is_ the split, and the names it produces are the contract a
                // kustomize overlay targets (Phase 15 C), so each one is spelled out here rather
                // than inferred from a count. The view is synthetic on purpose: the question is
                // what the planner does with a shape, not what this suite happens to load.
                const view = {
                    realms: ['srv', 'marine'],
                    groups: [
                        {name: 'srv.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'marine.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                    ],
                    ports: [
                        {id: 'srv.subject', type: 'dispatch', namespace: ['srv', 'srv-admin']},
                        {id: 'marine.payment', type: 'dispatch', namespace: 'marine'},
                    ],
                    roles: {},
                } as IRegistryView;
                const names = (options: Partial<IPlanOptions>): string[] =>
                    planFromRegistry(view, {
                        suiteName: 'demo',
                        frameworkImage: 'image',
                        ...options,
                    }).deployments.map(deployment => deployment.name);

                assert.deepEqual(
                    names({}),
                    ['srv', 'marine'],
                    'realm, the default, names each process after its realm',
                );
                assert.deepEqual(
                    names({profile: 'monolith'}),
                    ['demo'],
                    'monolith puts every realm in the one suite process',
                );
                assert.deepEqual(
                    names({profile: 'namespace'}),
                    ['srv', 'srv-admin', 'marine'],
                    'namespace splits by the namespace a realm answers in, finest first',
                );
                assert.deepEqual(
                    names({profile: 'group', groups: {platform: ['srv.orchestrator']}}),
                    ['platform'],
                    'group takes the map it is given, and only that',
                );
                assert.throws(
                    () => names({profile: 'layer' as never}),
                    /unknown deployment profile/,
                    'a profile the realm does not know is refused, not deployed as monolith',
                );
            },

            async function theRoleDecidesParticipation(assert: IAssert) {
                // A realm's role decides what it *is* in a deployment (T-235), and the namespace rule
                // is what follows from it: a companion is carried by every process and owns no
                // Service, a `both` realm is carried everywhere and owns one, and `none` is dropped
                // before any profile groups anything.
                //
                // The shared subject port is the case that shows why a companion contributes no
                // namespace: it names none of its own, because the realm that carries it declares
                // which namespace its models answer in (`orchestrator/subject/init.ts`) — while a
                // port that *did* name `subject` had `unservedNamespaces` publish a Service under
                // that name in every suite, pointing at every process (F-413's neighbourhood).
                const view = {
                    realms: ['srv', 'core', 'marine'],
                    groups: [
                        {name: 'srv.adapter', handlerCount: 1, layer: 'adapter'},
                        {name: 'core.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'marine.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                    ],
                    ports: [
                        {id: 'srv.subject', type: 'dispatch'},
                        {id: 'core.subject', type: 'dispatch', namespace: 'core'},
                        {id: 'marine.payment', type: 'dispatch', namespace: 'marine'},
                    ],
                    roles: {srv: 'companion', core: 'both'},
                } as IRegistryView;
                const plan = planFromRegistry(view, {suiteName: 'demo', frameworkImage: 'image'});

                assert.deepEqual(
                    plan.deployments.map(deployment => deployment.name).sort(),
                    ['core', 'marine'],
                    'only a deployable realm gets a process of its own',
                );
                const marine = plan.deployments.find(deployment => deployment.name === 'marine');
                assert.ok(marine, 'the service realm has a process');
                assert.deepEqual(
                    marine?.layers,
                    ['marine.orchestrator', 'srv.adapter', 'core.orchestrator'],
                    'a service realm carries the companions beside its own layers, realm included',
                );
                assert.deepEqual(
                    marine?.namespaces,
                    ['marine', 'core'],
                    'and its active namespaces are the ones its ports name for it',
                );
                assert.deepEqual(
                    plan.services.map(service => `${service.name}:${service.deployment}`).sort(),
                    ['core:core', 'marine:marine'],
                    'a companion owns no Service, and both owns its own',
                );
            },

            async function aSharedOrchestratorDoesNotOwnItsNamespaces(assert: IAssert) {
                // The shape blong-suite actually produces (T-236): the framework realm's subject
                // orchestrator is the *only* dispatch port, and it declares the namespaces of the
                // realms it carries — `server.subject` declares `subject` and `access`. Reading the
                // owner off that port pointed the `access` Service at the `server` deployment, so the
                // namespace decides instead: a namespace named after a deployable realm belongs to
                // it, and one that only companions declare publishes nothing.
                const view = {
                    realms: ['server', 'core', 'access'],
                    groups: [
                        {name: 'server.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'core.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'access.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                    ],
                    ports: [
                        {id: 'server.subject', type: 'dispatch', namespace: ['subject', 'access']},
                    ],
                    roles: {server: 'companion', core: 'both', access: 'both'},
                } as IRegistryView;
                const plan = planFromRegistry(view, {suiteName: 'demo', frameworkImage: 'image'});

                assert.deepEqual(
                    plan.services.map(service => `${service.name}:${service.deployment}`),
                    ['access:access'],
                    'the realm that owns the namespace owns the Service, and a shared one owns none',
                );
                assert.deepEqual(
                    plan.deployments.map(deployment => deployment.name).sort(),
                    ['access', 'core'],
                    'the companion that declares the namespaces gets no process of its own',
                );
                assert.deepEqual(
                    plan.deployments.find(deployment => deployment.name === 'access')?.layers,
                    ['access.orchestrator', 'server.orchestrator', 'core.orchestrator'],
                    'and every process lists the selectors it activates, realm prefix included',
                );
            },
            async function anExternalServiceIsKeyedByItsName(assert: IAssert) {
                // The declaration is a map and the plan is a list, and this is where the two meet. A
                // collection in configuration is a map because two sources — a suite's own config and
                // the tenant's CR — each add an entry without knowing about the other, and the merge
                // combines two arrays by position, which pairs one entry's name with another's ports.
                // The alias *is* the name the suite resolves, so the resolved entry has one spelling
                // of it rather than two that can disagree (T-249).
                const view = {
                    realms: ['marine'],
                    groups: [{name: 'marine.orchestrator', handlerCount: 1, layer: 'orchestrator'}],
                    ports: [{id: 'marine.payment', type: 'dispatch', namespace: 'marine'}],
                    roles: {},
                } as IRegistryView;
                const plan = planFromRegistry(view, {
                    suiteName: 'demo',
                    frameworkImage: 'image',
                    externalServices: {
                        db: {
                            externalName: 'mysql.backends.svc.cluster.local',
                            ports: [{name: 'mysql', port: 3306}],
                        },
                        cache: {externalName: 'redis.backends.svc.cluster.local'},
                    },
                });

                assert.deepEqual(
                    plan.externalServices.map(service => service.name),
                    ['db', 'cache'],
                    'each entry reaches the plan under the name it was declared by',
                );
                assert.deepEqual(
                    plan.externalServices.find(service => service.name === 'db'),
                    {
                        name: 'db',
                        externalName: 'mysql.backends.svc.cluster.local',
                        ports: [{name: 'mysql', port: 3306}],
                    },
                    'with its own fields, and no second copy of the name inside it',
                );
                assert.deepEqual(
                    planFromRegistry(view, {suiteName: 'demo', frameworkImage: 'image'})
                        .externalServices,
                    [],
                    'and a suite that declares none has none, which is ordinary',
                );
            },

            async function anExternalServiceItCannotMeanIsRefused(assert: IAssert) {
                // A CR is data from outside this process, and a shape the plan cannot read used to be
                // carried all the way into the tree: a stale CR that still held the list form resolved
                // to an entry called `0` with no `externalName`, and the apply failed with
                // `Missing key value for ?key?` — a message that named neither the field nor the CR
                // (F-403). The declaration is checked where it is read, so the failure says which
                // field, and what it should be.
                const view = {
                    realms: ['marine'],
                    groups: [{name: 'marine.orchestrator', handlerCount: 1, layer: 'orchestrator'}],
                    ports: [{id: 'marine.payment', type: 'dispatch', namespace: 'marine'}],
                    roles: {},
                } as IRegistryView;
                const refuse = (externalServices: unknown): string => {
                    try {
                        planFromRegistry(view, {
                            suiteName: 'demo',
                            frameworkImage: 'image',
                            externalServices,
                        } as never);
                    } catch (error) {
                        return (error as Error).message;
                    }
                    return '';
                };

                assert.match(
                    refuse([{name: 'db', externalName: 'mysql.backends.svc.cluster.local'}]),
                    /externalServices is a list, but it is a map keyed by the name/,
                    'the list form an older CR carried is refused, naming the field',
                );
                assert.match(
                    refuse({db: {ports: [{port: 3306}]}}),
                    /the external service "db" declares no externalName/,
                    'an entry with nothing to point at is refused, naming the service',
                );
                assert.match(
                    refuse({'': {externalName: 'mysql.backends.svc.cluster.local'}}),
                    /an external service declares no name/,
                    'and so is one whose key names nothing, because the key is the name',
                );
                assert.match(
                    refuse('db'),
                    /externalServices is a string/,
                    'while anything that is not a map says what it found instead',
                );
                assert.deepEqual(
                    planFromRegistry(view, {
                        suiteName: 'demo',
                        frameworkImage: 'image',
                        externalServices: {db: {externalName: 'mysql.backends.svc.cluster.local'}},
                    }).externalServices,
                    [{name: 'db', externalName: 'mysql.backends.svc.cluster.local'}],
                    'and the map is the one shape that is read',
                );
            },

            async function aPortalNamesTheProcessBehindIt(assert: IAssert) {
                // A portal is an address *and* the process behind it, and the planner is where the two
                // are joined. The realm is what a suite names, because a deployment name follows the
                // profile and would stop meaning the same thing the moment the split changed. Both
                // ways of leaving it out are refused: with several processes there is no
                // non-arbitrary answer, and a companion has no process for a portal to land on.
                const view = {
                    realms: ['srv', 'marine', 'admin'],
                    groups: [
                        {name: 'srv.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'marine.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                        {name: 'admin.orchestrator', handlerCount: 1, layer: 'orchestrator'},
                    ],
                    ports: [
                        {id: 'srv.subject', type: 'dispatch', namespace: 'subject'},
                        {id: 'marine.payment', type: 'dispatch', namespace: 'marine'},
                        {id: 'admin.panel', type: 'dispatch', namespace: 'admin'},
                    ],
                    roles: {srv: 'companion'},
                } as IRegistryView;
                const portal = (options: Partial<IPlanOptions>): IResolvedPortalMap =>
                    planFromRegistry(view, {
                        suiteName: 'demo',
                        frameworkImage: 'image',
                        ...options,
                    }).portal;

                assert.deepEqual(
                    portal({
                        portal: {marine: {realm: 'marine', host: 'marine.example'}},
                    }),
                    {marine: {realm: 'marine', host: 'marine.example', deployment: 'marine'}},
                    'a portal lands on the process of the realm it names, under the alias it was given',
                );
                assert.deepEqual(
                    portal({profile: 'monolith', portal: {web: {host: 'demo.example'}}}),
                    {web: {host: 'demo.example', deployment: 'demo'}},
                    'and a suite with one process may leave the realm out',
                );
                assert.throws(
                    () => portal({portal: {web: {host: 'demo.example'}}}),
                    /names no realm/,
                    'several processes and no realm is refused, because the first is arbitrary',
                );
                assert.throws(
                    () => portal({portal: {web: {realm: 'srv', host: 'demo.example'}}}),
                    /no process of its own/,
                    'and a companion is refused, because it owns no process to serve one',
                );
            },
        ]),
}));
