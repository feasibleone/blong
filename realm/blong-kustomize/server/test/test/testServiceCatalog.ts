import {handler, type IAssert, type IMeta} from '@feasibleone/blong';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildKustomizeTree} from '../../../generator.ts';
import {planFromRegistry, registryView, type IRegistryView} from '../../../plan.ts';
import {
    DEFAULT_SERVICES_NAMESPACE,
    externalServicesOf,
    loadServiceCatalog,
    resolveBackingServices,
} from '../../../services.ts';

/**
 * The nodes these trees are generated for.
 *
 * A `nodeLocal` volume is one directory per node, so a plan without nodes is a plan whose tree cannot
 * be written — and a unit test has no cluster to ask (D-470).
 */
const NODES = ['node-a', 'node-b'];

/**
 * server/test/test/testServiceCatalog.ts — the third-party services a deployment brings with it.
 *
 * The descriptor files are the deployment's, and everything downstream of them is this realm's: that
 * they are validated as they are read, that the adapters a plan activates decide which of them a
 * deployment needs, that a deployment may switch one off and may not switch one on for an adapter it
 * does not activate, and that the alias a realm's config keeps naming is derived from the service
 * rather than from a host somebody typed.
 *
 * Registered as the `test.service.catalog` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testServiceCatalog: ({name = 'service catalog'}: {name?: string} = {}) =>
        group(name)([
            async function everyDescriptorRendersWithItsOwnBase(assert: IAssert) {
                // A service is added by adding a descriptor, and a descriptor is half of one: the base
                // beside it is what the image contributes, and a deployment that needs a service whose
                // base is missing fails at generation with the file it looked for. Rendering every
                // descriptor in the catalogue keeps that failure here instead — and catches the
                // placeholder a base mistyped, which the generator refuses by name.
                const catalog = loadServiceCatalog();
                assert.ok(
                    catalog.length >= 7,
                    'the catalogue carries the services this realm knows',
                );
                for (const descriptor of catalog) {
                    const plan = planFromRegistry(
                        registryView({
                            describe: () => ({realms: ['srv'], ports: ['srv.db']}),
                            getPort: () => ({config: {type: descriptor.kinds[0]}}),
                        }),
                        {
                            suiteName: 'shop',
                            frameworkImage: 'blong',
                            servicesNamespace: 'shop-services',
                            storageClassName: 'local-path',
                            nodes: NODES,
                        },
                    );
                    const service = plan.backingServices.find(
                        candidate => candidate.name === descriptor.name,
                    );
                    assert.ok(service, `${descriptor.name}: its own kind implies it`);
                    assert.ok(
                        buildKustomizeTree(plan).has(`services/${descriptor.name}/deployment.yaml`),
                        `${descriptor.name}: the base beside its descriptor is rendered`,
                    );
                }
            },

            async function everyDescriptorLoadsAndValidates(assert: IAssert) {
                const catalog = loadServiceCatalog();
                assert.deepEqual(
                    catalog.map(descriptor => descriptor.name),
                    ['kafka', 'keycloak', 'minio', 'mongodb', 'mysql', 'redis', 'vault'],
                    'the catalog is one descriptor per service, read in a stable order',
                );
                // One representative per shape the schema allows: a service with storage and
                // credentials (mysql), one stateless (redis), one whose base needs values (kafka).
                const mysql = catalog.find(entry => entry.name === 'mysql');
                assert.ok(mysql?.storage?.mountPath, 'a database names where its data lives');
                assert.deepEqual(
                    mysql?.credentials?.keys,
                    ['MYSQL_USER', 'MYSQL_PASSWORD'],
                    'and the keys its credentials are read from, by name',
                );
                assert.equal(
                    catalog.find(entry => entry.name === 'redis')?.storage,
                    undefined,
                    'a cache declares none: what it holds is rebuildable, and its deployment says otherwise',
                );
                assert.equal(
                    catalog.find(entry => entry.name === 'kafka')?.values?.['internalPort'],
                    29092,
                    'and a base reads the values only it needs',
                );
            },

            async function aDescriptorTheSchemaCannotMeanIsRefused(assert: IAssert) {
                // The failure this covers is a descriptor that *looks* fine: `kind` where the schema
                // says `kinds` would leave the service implied by nothing, so the deployment would
                // start a process that dials a database nothing generated — and nothing would say so.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-services-'));
                try {
                    writeFileSync(join(dir, 'mysql.yaml'), 'name: mysql\nkind: [knex]\n');
                    assert.throws(
                        () => loadServiceCatalog(dir),
                        error => {
                            const message = String((error as Error).message);
                            return (
                                message.includes('mysql.yaml') &&
                                message.includes('kinds') &&
                                !message.includes(undefined as unknown as string)
                            );
                        },
                        'the file is named, and the field the schema wanted is',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function theAdaptersDecideWhichServicesAreNeeded(assert: IAssert) {
                const catalog = loadServiceCatalog();
                const resolved = resolveBackingServices(catalog, {
                    kinds: ['knex'],
                    databases: ['blong-suite', 'blong-access'],
                    storageClassName: 'local-path',
                });
                assert.deepEqual(
                    resolved.services.map(service => service.name),
                    ['mysql'],
                    'a plan that activates `knex` needs a database and nothing else',
                );
                assert.deepEqual(
                    resolved.disabled,
                    [],
                    'and nothing is disabled unless the deployment says so',
                );
                assert.deepEqual(
                    resolved.services[0]?.databases,
                    ['blong-suite', 'blong-access'],
                    'the databases are the plan own list, in the order its connections named them',
                );
                assert.equal(
                    resolved.services[0]?.storageClassName,
                    'local-path',
                    'and the claim asks for the class the deployment named',
                );
                assert.equal(
                    resolved.services[0]?.namespace,
                    DEFAULT_SERVICES_NAMESPACE,
                    'with the workloads landing in the services namespace',
                );

                assert.deepEqual(
                    resolveBackingServices(catalog, {kinds: ['knex', 'redis', 's3']})
                        .services.map(service => service.name)
                        .sort(),
                    ['minio', 'mysql', 'redis'],
                    'three adapters bring three services, whatever order they are named in',
                );
            },

            async function aDeploymentMaySwitchOneOffAndNotOneOn(assert: IAssert) {
                const catalog = loadServiceCatalog();
                const off = resolveBackingServices(catalog, {
                    kinds: ['knex'],
                    config: {mysql: false},
                });
                assert.deepEqual(
                    off.services,
                    [],
                    'a deployment that runs its own database gets none',
                );
                assert.deepEqual(
                    off.disabled,
                    ['mysql'],
                    'and is told what it left out rather than being given a second one',
                );

                assert.throws(
                    () => resolveBackingServices(catalog, {kinds: ['knex'], config: {kafka: true}}),
                    /no activated adapter kind implies it/,
                    'a service switched on for an adapter nothing activates is refused',
                );
                assert.throws(
                    () =>
                        resolveBackingServices(catalog, {
                            kinds: ['knex'],
                            config: {postgres: true},
                        }),
                    /no descriptor under services\/ names that service/,
                    'and so is a name no descriptor carries',
                );

                const overridden = resolveBackingServices(catalog, {
                    kinds: ['knex'],
                    config: {mysql: {image: 'mysql/mysql-server:8.0.36', storage: {size: '2Gi'}}},
                });
                assert.equal(
                    overridden.services[0]?.image,
                    'mysql/mysql-server:8.0.36',
                    'a deployment may pin another image',
                );
                assert.equal(
                    overridden.services[0]?.storage?.size,
                    '2Gi',
                    'and ask for less of it, while the path stays the service own',
                );
                assert.equal(
                    overridden.services[0]?.storage?.mountPath,
                    '/var/lib/mysql',
                    'because what the container mounts is the image contract, not a preference',
                );

                const withDatabases = resolveBackingServices(catalog, {
                    kinds: ['knex'],
                    databases: ['named-by-a-connection'],
                    config: {
                        mysql: {databases: ['named-by-the-deployment', 'named-by-a-connection']},
                    },
                });
                assert.deepEqual(
                    withDatabases.services[0]?.databases,
                    ['named-by-a-connection', 'named-by-the-deployment'],
                    'what the deployment names is added to what its connections name, not instead of',
                );
            },

            async function aDeploymentSuppliesTheInitItsServiceNeeds(assert: IAssert) {
                // Two shapes, and the descriptor says which one a service is. MySQL's script is a
                // template the base mounts into the Deployment — one line per database the plan names.
                // Keycloak's realm is created by *calling* a running server, so the step is a process
                // of its own, and the script is the deployment's: this realm has no opinion about what
                // a realm of Keycloak's contains, so it writes the text as it arrived (D-466).
                const view = registryView({
                    describe: () => ({realms: ['srv'], ports: ['srv.keycloak']}),
                    getPort: () => ({config: {type: 'keycloak'}}),
                });
                const options = {
                    suiteName: 'shop',
                    frameworkImage: 'blong',
                    servicesNamespace: 'shop-services',
                    nodes: NODES,
                };
                const plain = buildKustomizeTree(planFromRegistry(view, options));
                assert.ok(
                    plain.has('services/keycloak/deployment.yaml'),
                    'the service itself is generated for the adapter that implies it',
                );
                assert.equal(
                    plain.get('services/keycloak/init-config.yaml'),
                    undefined,
                    'but an init with nothing to run is not',
                );
                assert.equal(
                    plain.get('services/keycloak/init-job.yaml'),
                    undefined,
                    'and neither is the Job that would run it',
                );

                // A token a template would expand, kept in the text on purpose: a deployment's script
                // is not this realm's template, and the different spelling is what says so.
                const script =
                    '/opt/keycloak/bin/kcadm.sh create realms -s realm=shop\n' +
                    '# ${db} is part of the realm name here, not a placeholder\n';
                const supplied = buildKustomizeTree(
                    planFromRegistry(view, {
                        ...options,
                        services: {keycloak: {init: {script}}},
                    }),
                );
                const config = supplied.get('services/keycloak/init-config.yaml') as {
                    data?: Record<string, string>;
                };
                assert.equal(
                    config.data?.['init.sh'],
                    script,
                    'the script is written verbatim, `${db}` and all',
                );
                type IJob = {
                    metadata?: {name?: string};
                    spec?: {
                        template?: {
                            spec?: {
                                restartPolicy?: string;
                                containers?: Array<{
                                    command?: string[];
                                    envFrom?: unknown[];
                                    volumeMounts?: Array<{mountPath?: string}>;
                                }>;
                            };
                        };
                    };
                };
                const job = supplied.get('services/keycloak/init-job.yaml') as IJob;
                assert.match(
                    String(job.metadata?.name),
                    /^keycloak-init-[0-9a-f]{8}$/,
                    'the Job is named for the script it runs, because a Job spec cannot change',
                );
                const container = job.spec?.template?.spec?.containers?.[0];
                assert.deepEqual(
                    container?.command,
                    ['sh', '/opt/blong-init/init.sh'],
                    'and runs the mounted file rather than the text quoted into a command line',
                );
                assert.deepEqual(
                    container?.envFrom,
                    [{secretRef: {name: 'keycloak-credentials'}}],
                    'with the credentials an init script logs in by',
                );
                assert.equal(
                    container?.volumeMounts?.[0]?.mountPath,
                    '/opt/blong-init',
                    'mounted where the command reads it',
                );
                assert.equal(
                    job.spec?.template?.spec?.restartPolicy,
                    'OnFailure',
                    'while a server that is not up yet is a retry rather than a failed deployment',
                );
                const again = buildKustomizeTree(
                    planFromRegistry(view, {
                        ...options,
                        services: {keycloak: {init: {script}}},
                    }),
                ).get('services/keycloak/init-job.yaml') as IJob;
                assert.equal(
                    again.metadata?.name,
                    job.metadata?.name,
                    'and the same script is the same Job, so a re-apply is not a new attempt',
                );
            },

            async function aGeneratedSecretIsReadableWhereTheSuiteDialsIt(assert: IAssert) {
                // A pod reads only the Secrets of its own namespace, and the alias this tree publishes
                // is dialled from the suite's. A deployment pointed at the database generated for it
                // therefore needs the values twice, and derived rather than random, so that the two
                // copies cannot drift and nothing has to sync them (D-462).
                const view = registryView({
                    describe: () => ({realms: ['srv'], ports: ['srv.db']}),
                    getPort: () => ({config: {type: 'knex'}}),
                });
                const generated = resolveBackingServices(loadServiceCatalog(), {
                    kinds: ['knex'],
                    namespace: 'shop-services',
                });
                assert.equal(
                    generated.services[0]?.credentialsGenerated,
                    true,
                    'a Secret this tree writes is marked as one it can write twice',
                );
                const plan = planFromRegistry(view, {
                    suiteName: 'shop',
                    frameworkImage: 'blong',
                    servicesNamespace: 'shop-services',
                    nodes: NODES,
                });
                const tree = buildKustomizeTree(plan);
                type ISecret = {
                    metadata?: Record<string, unknown>;
                    stringData?: Record<string, string>;
                };
                const beside = tree.get('services/mysql/credentials.yaml') as ISecret;
                const inSuite = tree.get('services/mysql/credentials-in-suite.yaml') as ISecret;
                assert.ok(inSuite, 'the copy the deployment reads is written');
                assert.equal(
                    inSuite.metadata?.['namespace'],
                    plan.suite.namespace,
                    'in the namespace the suite runs its own pods in',
                );
                assert.equal(
                    inSuite.metadata?.['name'],
                    beside.metadata?.['name'],
                    'under the name the workload and the connection both know',
                );
                assert.deepEqual(
                    inSuite.stringData,
                    beside.stringData,
                    'and with the same values, because both are derived from the plan',
                );

                const owned = buildKustomizeTree(
                    planFromRegistry(view, {
                        suiteName: 'shop',
                        frameworkImage: 'blong',
                        servicesNamespace: 'shop-services',
                        nodes: NODES,
                        services: {mysql: {credentials: {secret: 'hand-made'}}},
                    }),
                );
                assert.equal(
                    owned.get('services/mysql/credentials-in-suite.yaml'),
                    undefined,
                    'a Secret a deployment owns is theirs to place, so nothing is copied',
                );
                assert.equal(
                    (owned.get('services/mysql/credentials.yaml') as ISecret).metadata?.['name'],
                    'hand-made',
                    'while the workload still reads the name the deployment gave it',
                );
            },

            async function theDeploymentNamesWhereAWorkloadMayRun(assert: IAssert) {
                // A base ships no placement: on a bare cluster the scheduler decides, and a deployment
                // whose nodes are labelled has to say so. The pod spec is the only place a selector, a
                // toleration or an affinity belongs, so the plan's word arrives at render time.
                const view = registryView({
                    describe: () => ({realms: ['srv'], ports: ['srv.db']}),
                    getPort: () => ({config: {type: 'knex'}}),
                });
                type IWorkload = {
                    spec?: {template?: {spec?: Record<string, unknown>}};
                };
                const plain = buildKustomizeTree(
                    planFromRegistry(view, {
                        suiteName: 'shop',
                        frameworkImage: 'blong',
                        servicesNamespace: 'shop-services',
                        nodes: NODES,
                    }),
                ).get('services/mysql/deployment.yaml') as IWorkload;
                assert.equal(
                    plain.spec?.template?.spec?.['nodeSelector'],
                    undefined,
                    'a workload the deployment did not place is left to the scheduler',
                );

                const placed = buildKustomizeTree(
                    planFromRegistry(view, {
                        suiteName: 'shop',
                        frameworkImage: 'blong',
                        servicesNamespace: 'shop-services',
                        nodes: NODES,
                        services: {
                            mysql: {
                                placement: {
                                    nodeSelector: {'kubernetes.io/hostname': 'worker-1'},
                                    tolerations: [{key: 'dedicated', operator: 'Exists'}],
                                },
                            },
                        },
                    }),
                ).get('services/mysql/deployment.yaml') as IWorkload;
                assert.deepEqual(
                    placed.spec?.template?.spec?.['nodeSelector'],
                    {'kubernetes.io/hostname': 'worker-1'},
                    'what the deployment names reaches the pod spec',
                );
                assert.deepEqual(
                    placed.spec?.template?.spec?.['tolerations'],
                    [{key: 'dedicated', operator: 'Exists'}],
                    'toleration and all, passed through rather than interpreted',
                );
                assert.ok(
                    (placed.spec?.template?.spec?.['containers'] as unknown[] | undefined)?.length,
                    'while the base still carries the container it rendered',
                );
            },

            async function theAliasIsNamedAfterTheService(assert: IAssert) {
                const services = resolveBackingServices(loadServiceCatalog(), {
                    kinds: ['knex', 's3'],
                    namespace: 'shop-services',
                }).services;
                const aliases = externalServicesOf(services);
                assert.deepEqual(
                    aliases['mysql'],
                    {
                        externalName: 'mysql.shop-services.svc.cluster.local',
                        ports: [{name: 'mysql', port: 3306}],
                    },
                    'the alias answers where the workload is, not where somebody installed it',
                );
                assert.ok(
                    aliases['minio']?.ports.some(port => port.port === 9000),
                    'and carries the port the adapter dials',
                );
            },

            async function thePlanCarriesWhatTheAdapterImplies(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // The wiring, end to end and without a cluster: a view whose only adapter is a knex
                // port with a database name in its configuration produces a plan that brings a MySQL
                // and asks it for that database — which is what the generator will render.
                const view = registryView({
                    describe: () => ({
                        realms: ['srv'],
                        ports: ['srv.db'],
                    }),
                    getPort: () => ({
                        config: {
                            type: 'knex',
                            connection: {database: 'blong-suite'},
                        },
                    }),
                });
                assert.deepEqual(
                    view.ports.map(port => port.type),
                    ['knex'],
                    'the view keeps the kind an adapter declared',
                );
                const plan = planFromRegistry(view, {
                    suiteName: 'shop',
                    frameworkImage: 'blong',
                    servicesNamespace: 'blong-services',
                    nodes: NODES,
                });
                assert.deepEqual(
                    plan.backingServices.map(service => service.name),
                    ['mysql'],
                    'and the plan brings the service that kind implies',
                );
                assert.deepEqual(
                    plan.backingServices[0]?.databases,
                    ['blong-suite'],
                    'with the database its connection named, which is the list the init script needs',
                );
                assert.deepEqual(
                    plan.externalServices,
                    [],
                    'while the alias is not published yet: it arrives with the workload',
                );
                const switched = planFromRegistry(view, {
                    suiteName: 'shop',
                    frameworkImage: 'blong',
                    services: {mysql: false},
                    servicesNamespace: 'shop-services',
                    storageClassName: 'local-path',
                    nodes: NODES,
                });
                assert.deepEqual(
                    switched.backingServices,
                    [],
                    'a deployment that runs its own database is given none',
                );
                assert.deepEqual(
                    switched.backingServiceRequest,
                    {
                        services: {mysql: false},
                        servicesNamespace: 'shop-services',
                        storageClassName: 'local-path',
                    },
                    'and the request travels on the plan, because what it resolved to cannot say it back',
                );
                // Why it travels: the operator regenerates the tree from the CR, so a switch the
                // declaration cannot carry is a service that comes back on the next pass.
                const cr = buildKustomizeTree({...switched, crd: true}).get(
                    'blongdeployment.yaml',
                ) as {
                    spec?: Record<string, unknown>;
                };
                assert.deepEqual(
                    cr?.spec?.['services'],
                    {mysql: false},
                    'the CR carries the switch, which is what its CRD declares',
                );
                assert.equal(
                    cr?.spec?.['servicesNamespace'],
                    'shop-services',
                    'the namespace the workloads belong in',
                );
                assert.equal(cr?.spec?.['storageClassName'], 'local-path', 'and the class');
                assert.ok($meta, 'a plan is built from the meta every step shares');
            },

            async function aViewWithNoAdapterBringsNoService(assert: IAssert) {
                // A realm-only plan is what most suites are, and it must not grow a database: the
                // negative half of the rule, pinned beside its positive one.
                const plan = planFromRegistry(
                    {realms: [], groups: [], ports: [], roles: {}} as IRegistryView,
                    {suiteName: 'shop', frameworkImage: 'blong'},
                );
                assert.deepEqual(plan.backingServices, [], 'nothing activated, nothing brought');
            },
        ]),
}));
