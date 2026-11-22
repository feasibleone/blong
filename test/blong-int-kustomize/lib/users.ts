import {randomBytes} from 'node:crypto';

import {parse} from 'yaml';

import {type IPortForward, portForward} from './cluster.ts';
import {type IStepIo, fail, onPath} from './exec.ts';

/**
 * The login a run provisions for itself, and takes away again.
 *
 * The runbook used to be handed `BLONG_TEST_USER`/`BLONG_TEST_PASSWORD`, which meant it could only
 * check the login round trip against a deployment that carried a **test seed** — and a deployment
 * that faces the internet must not carry one. A seed is a password somebody knows, in a database
 * anybody can reach, and the page it opens is the administrative UI.
 *
 * So the run makes its own login: a name nobody would guess, a password generated for this run and
 * never written anywhere, an `Admin` grant so the round trip exercises the same authorization a
 * person's login does, and a `blong-dev user remove` in a `finally` (`@@D-952`).
 *
 * The connection is the **deployment's own** — the rc document the tree mounts into every pod
 * (`blong-releaserc-etc`) — reached through a port-forward to the Service the suite dials. Nothing is
 * taken from the machine: a CI runner has no `.blong_devrc`, and the database is not published
 * outside the cluster there, which a version that read the developer's rc would have found out as a
 * mysterious `ECONNREFUSED`.
 */
export interface IProvisionedUser {
    userName: string;
    password: string;
}

/** The database a deployment dials, as the deployment itself names it. */
export interface IDeploymentDatabase {
    /** The port on this machine the forward answers on. */
    port: number;
    user?: string;
    password?: string;
    database?: string;
    /** The forward, which the caller stops once the login check is over. */
    forward?: IPortForward;
}

/** What a run may say about the login it writes: the namespace, and the role if it is not `Admin`. */
export interface IProvisionOptions {
    namespace: string;
    /** The role the login is granted; `Admin` reaches everything a page asks for. */
    role?: string;
    /** The database, when the caller resolved it already. */
    database?: IDeploymentDatabase;
}

/** The port the forward takes on this machine: 3306 is often a database of the developer's own. */
const LOCAL_DB_PORT = 13306;

/** A name nobody would choose, and a password generated for this run alone. */
export const runUserNames = (): IProvisionedUser => ({
    userName: `runbook-${randomBytes(4).toString('hex')}`,
    // Long enough for every policy the realm seeds, and drawn from the CSPRNG rather than composed
    // from words: it is never typed by a person, so nothing has to be memorable.
    password: randomBytes(24).toString('base64url'),
});

/** The `srv.db.knex.connection` block, as far as this file needs it. */
interface IConnectionBlock {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
}

/** The rc document the pods mount, as the YAML it carries. */
const tenantRc = async (
    namespace: string,
    io: IStepIo,
): Promise<Record<string, unknown> | undefined> => {
    const encoded = await io.capture(
        'kubectl',
        [
            '-n',
            namespace,
            'get',
            'secret',
            'blong-releaserc-etc',
            '-o',
            'jsonpath={.data.blong_releaserc}',
        ],
        {allowFailure: true},
    );
    const text = encoded.trim();
    if (!text) return undefined;
    try {
        return parse(Buffer.from(text, 'base64').toString('utf8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
};

/**
 * The database Service behind the host a deployment names.
 *
 * `db` is an ExternalName in the suite's namespace, so the workload that holds the data is behind
 * `mysql.blong-integration.svc.cluster.local` — an ExternalName Service has no endpoints to forward
 * to. Both spellings are answered: a bare name is resolved through its Service's `externalName`, an
 * FQDN is split into the Service and its namespace, and a host that is neither is taken as a Service
 * of the suite's own namespace.
 */
const databaseService = async (
    namespace: string,
    host: string,
    io: IStepIo,
): Promise<{namespace: string; service: string} | undefined> => {
    const split = (name: string): {namespace: string; service: string} | undefined => {
        const [service, databaseNamespace] = name.split('.');
        return service && databaseNamespace ? {namespace: databaseNamespace, service} : undefined;
    };
    if (host.endsWith('.svc.cluster.local')) return split(host);
    const externalName = await io.capture(
        'kubectl',
        ['-n', namespace, 'get', 'service', host, '-o', 'jsonpath={.spec.externalName}'],
        {allowFailure: true},
    );
    const target = externalName.trim();
    if (target.endsWith('.svc.cluster.local')) return split(target);
    return {namespace, service: host};
};

/**
 * Read the deployment's database and open a forward to it.
 *
 * No rc document is ordinary rather than an error: a deployment that mounts none keeps whatever
 * connection its own configuration names, and the caller decides whether that is enough.
 */
export const deploymentDatabase = async (
    namespace: string,
    io: IStepIo,
): Promise<IDeploymentDatabase | undefined> => {
    const rc = (await tenantRc(namespace, io)) as
        | {srv?: {db?: {knex?: {connection?: IConnectionBlock}}}}
        | undefined;
    const connection = rc?.srv?.db?.knex?.connection;
    if (!connection?.host) return undefined;
    const service = await databaseService(namespace, connection.host, io);
    if (!service) return undefined;
    io.log(
        `the deployment dials ${connection.host} (${service.service}.${service.namespace}), ` +
            `database ${connection.database ?? '(unnamed)'}`,
    );
    const forward = await portForward(
        {
            namespace: service.namespace,
            service: service.service,
            localPort: LOCAL_DB_PORT,
            remotePort: connection.port ?? 3306,
        },
        io,
    );
    return {
        port: LOCAL_DB_PORT,
        user: connection.user,
        password: connection.password,
        database: connection.database,
        forward,
    };
};

/** The connection flags one `blong-dev user` call is given. */
const connectionArgs = (database: IDeploymentDatabase): string[] => [
    '--host=127.0.0.1',
    `--port=${database.port}`,
    ...(database.user ? [`--user=${database.user}`] : []),
    ...(database.password ? [`--db-password=${database.password}`] : []),
    ...(database.database ? [`--database=${database.database}`] : []),
];

/**
 * Create the run's own login, and answer it.
 *
 * A failure here is the run's failure rather than a skipped check: a run that cannot prove the login
 * never says whether a released process reached its credential tables, and a silently skipped check
 * is the green run that hid a broken release (`@@T-266`). Each message names what is missing,
 * because every cause of it is a step the caller can take.
 */
export const provisionUser = async (
    options: IProvisionOptions,
    io: IStepIo,
): Promise<IProvisionedUser> => {
    // The tool is the workspace's, so it is found through the package's own bins rather than the
    // runner's `PATH` @@F-809. A run whose install is incomplete says so here, instead of failing at
    // the spawn with a bare `ENOENT`.
    if (!onPath('blong-dev')) {
        return fail(
            'blong-dev is not installed for this package: this run provisions its own login with ' +
                '`blong-dev user add` rather than assuming a test seed in the deployment, and the ' +
                'binary it calls is the one `node_modules/.bin` holds — run `rush update` in the ' +
                'repository root so the workspace tool is installed',
        );
    }
    const database = options.database ?? (await deploymentDatabase(options.namespace, io));
    if (!database) {
        return fail(
            'the deployment names no database this run can reach: its rc Secret ' +
                '(blong-releaserc-etc) carries no connection, so a login cannot be provisioned — ' +
                'mount one, or point the suite at a database the run can dial',
        );
    }
    const user = runUserNames();
    io.log(`provisioning ${user.userName} for this run's login check`);
    await io.run('blong-dev', [
        'user',
        'add',
        user.userName,
        `--password=${user.password}`,
        `--role=${options.role ?? 'Admin'}`,
        ...connectionArgs(database),
        '--output=json',
    ]);
    options.database = database;
    return user;
};

/**
 * Remove the login, whatever the run did with it, and close the forward.
 *
 * A removal that fails is a warning and not a failure: the deployment is already judged by then, and
 * turning a leftover row into a red run teaches people to ignore the report. The line names the
 * login, which is what an operator needs to finish the job by hand.
 */
export const retireUser = async (
    user: IProvisionedUser,
    options: IProvisionOptions,
    io: IStepIo,
): Promise<void> => {
    try {
        await io.run('blong-dev', [
            'user',
            'remove',
            user.userName,
            ...(options.database ? connectionArgs(options.database) : []),
            '--output=json',
        ]);
    } catch (error) {
        io.warn(
            `the run's login ${user.userName} was not removed (${(error as Error).message}): ` +
                `\`blong-dev user remove ${user.userName}\` against the deployment's database ` +
                'finishes it',
        );
    } finally {
        options.database?.forward?.stop();
    }
};
