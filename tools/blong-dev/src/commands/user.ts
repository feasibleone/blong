/**
 * `blong-dev user` — create an access user straight in a database.
 *
 * A login is resolved from `core_resource.resourceName` joined with
 * `access_user` on `userId` (`core_type.typeAlias = 'access.user'`), so the
 * **login name is the resource name** — not a column of `access_user`, which
 * carries no user name at all. `access.user.add` names the resource after
 * `emailAddress` when both are submitted, which is why a user created that way
 * logs in with its email address, not with the name the caller passed. This
 * command writes the name it is given, so `blong-dev user add admin` creates a
 * login called `admin`.
 *
 * The rows are the ones `access.user.add` writes, in the order it writes them
 * (resource → entity row → credential → `hasRole` edges → `access_pathRefresh`),
 * so the user is usable by the gateway and the model screens immediately:
 *
 * - `core_type` (`access.user`) and `core_resource` (the login name),
 * - `access_user` (email, `isActive`),
 * - `access_credential` (`credentialType = 'password'`, a PBKDF2 digest, the
 *   salt and the parameters that produced it — verification re-uses the stored
 *   parameters, so the iteration count only has to match itself),
 * - the `hasRole` triples of the requested roles (resolved from their **names**,
 *   an argument `access.user.add` accepts but silently ignores),
 * - a call to the `access_pathRefresh` stored procedure that materializes the
 *   effective permission paths.
 *
 * The command finishes by reading back whether the granted roles reach
 * `accessLogin`. Without that action the login endpoint answers "User is not
 * allowed to log in", and the only clue is a seed far from the user record — so
 * the answer is printed here instead of being rediscovered.
 *
 * Usage:
 *   blong-dev user add <userName> --password <secret> [--role Admin,Manager]
 *                       [--email <address>] [--inactive] [--update]
 *                       [--database <db>] [--host h] [--port p]
 *                       [--user dbUser] [--db-password dbSecret] [--output json]
 *
 *   blong-dev user passwd <userName> --password <newSecret> [--strict|--force]
 *
 *   blong-dev user list [--role <name>] [--output json]
 *
 * `--password` is the NEW user's login secret; the database's own password is
 * `--db-password`. The connection otherwise comes from `.blong_devrc` exactly as
 * `blong-dev sql` resolves it (`--config <key>`, dev defaults, derived
 * `${suite}-${user}` database).
 */

import {createConnection} from 'mysql2/promise';
import {pbkdf2Sync, randomUUID} from 'node:crypto';

import {parseArgs} from './log.ts';
import {
    ensureDatabase,
    readConnection,
    type IAdminConnection,
    type IConnectionInfo,
} from './sql.ts';

/** The parameters that produced a password digest, stored beside it. */
export interface IPasswordParams {
    function: string;
    algorithm: string;
    iterations: number;
    keyLength: number;
    digest: string;
}

/**
 * The digest parameters used for a credential this command creates.
 *
 * Verification reads the parameters stored on the credential row, so any value
 * verifies as long as the same one produced the digest (F-553). These match the
 * framework defaults (`realm/blong-access/adapter/db/password.ts`), which is what
 * a production database carries; `--iterations` overrides them for a database
 * whose policy asks for something else.
 */
export const DEFAULT_PASSWORD_PARAMS: IPasswordParams = {
    function: 'hash',
    algorithm: 'pbkdf2',
    iterations: 100000,
    keyLength: 64,
    digest: 'sha512',
};

/** The type alias every access user resource carries. */
const USER_TYPE_ALIAS = 'access.user';

/** The action a role must reach for its holder to be allowed to log in. */
const LOGIN_ACTION = 'accessLogin';

/** UUID text → the 16-byte buffer the binary columns hold. */
export function uuidBuffer(uuid: string): Buffer {
    return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

/** A binary column value → upper-case hex text (the shape query results carry). */
function hexOf(value: unknown): string {
    if (Buffer.isBuffer(value)) return value.toString('hex').toUpperCase();
    return String(value ?? '').toUpperCase();
}

/** Derive the stored digest for a password, returning what the row must carry. */
export function hashPassword(
    password: string,
    salt: string,
    params: IPasswordParams = DEFAULT_PASSWORD_PARAMS,
): {hash: string; params: IPasswordParams} {
    const hash = pbkdf2Sync(password, salt, params.iterations, params.keyLength, params.digest);
    return {hash: hash.toString('hex'), params};
}

/** The options `blong-dev user add` was asked for. */
export interface IUserAddOptions {
    userName: string;
    password: string;
    roles: string[];
    emailAddress?: string;
    isActive: boolean;
    update: boolean;
    passwordParams: IPasswordParams;
    /** Refuse a secret the active policy would reject (see `--strict`). */
    strict: boolean;
    /** Silence the policy warning (see `--force`). */
    force: boolean;
}

/** A parsed `parseArgs` result, as `readConnection` and this module both need it. */
type IParsed = ReturnType<typeof parseArgs>;

/** Split a `--role Admin,Manager` value into names, dropping blanks and repeats. */
export function parseRoleNames(raw: string | undefined): string[] {
    if (!raw) return [];
    const names = raw
        .split(/[,\s]+/)
        .map(name => name.trim())
        .filter(Boolean);
    return [...new Set(names)];
}

/**
 * Read the options of `blong-dev user add` from parsed arguments.
 *
 * `positionals[0]` is the user name (the verb has already been consumed).
 * Throws with a caller-facing message when a required value is missing, so the
 * command can print it and exit non-zero without a stack trace.
 */
export function readUserAddOptions(parsed: IParsed): IUserAddOptions {
    const userName = (parsed.positionals[0] ?? '').trim();
    if (!userName) throw new Error('a user name is required');
    if (/\s/.test(userName)) throw new Error('the user name must not contain whitespace');
    const password = parsed.options.get('password');
    if (password === undefined) {
        // `--password` with nothing after it parses as a flag, not as an empty value.
        if (parsed.flags.has('password')) throw new Error('--password must not be empty');
        throw new Error('--password <secret> is required');
    }
    if (!password) throw new Error('--password must not be empty');
    const iterations = parsed.options.get('iterations');
    const passwordParams = iterations
        ? {...DEFAULT_PASSWORD_PARAMS, iterations: Number(iterations)}
        : DEFAULT_PASSWORD_PARAMS;
    if (!Number.isInteger(passwordParams.iterations) || passwordParams.iterations < 1) {
        throw new Error('--iterations must be a positive integer');
    }
    const emailAddress = parsed.options.get('email')?.trim();
    return {
        userName,
        password,
        roles: parseRoleNames(parsed.options.get('role')),
        ...(emailAddress ? {emailAddress} : {}),
        isActive: !parsed.flags.has('inactive'),
        update: parsed.flags.has('update'),
        passwordParams,
        strict: parsed.flags.has('strict'),
        force: parsed.flags.has('force'),
    };
}

/**
 * The database overrides of this command, rewritten to the names
 * `readConnection` reads.
 *
 * `--password` belongs to the user being created, so the database's own
 * credentials arrive as `--db-password` / `--db-user` and are mapped here. `--user`
 * is left to `readConnection` (the database user, as in `blong-dev sql`).
 */
export function databaseArgs(parsed: IParsed): IParsed {
    const options = new Map(parsed.options);
    options.delete('password');
    options.delete('role');
    options.delete('email');
    options.delete('iterations');
    const dbPassword = parsed.options.get('db-password');
    if (dbPassword !== undefined) options.set('password', dbPassword);
    const dbUser = parsed.options.get('db-user');
    if (dbUser !== undefined) options.set('user', dbUser);
    return {...parsed, options};
}

/** The options `blong-dev user passwd` was asked for. */
export interface IUserPasswdOptions {
    userName: string;
    password: string;
    passwordParams: IPasswordParams;
    /** Refuse a secret shorter than the active policy's `minLength`. */
    strict: boolean;
    /** Silence the policy warning (a deliberately weak test password). */
    force: boolean;
}

/**
 * Read the options of `blong-dev user passwd`.
 *
 * The secret is the only required value beyond the user name: this verb exists
 * because a deployment can have no page that changes a password, so it has to work
 * without anything else.
 */
export function readUserPasswdOptions(parsed: IParsed): IUserPasswdOptions {
    const userName = (parsed.positionals[0] ?? '').trim();
    if (!userName) throw new Error('a user name is required');
    const password = parsed.options.get('password');
    if (password === undefined) {
        if (parsed.flags.has('password')) throw new Error('--password must not be empty');
        throw new Error('--password <newSecret> is required');
    }
    if (!password) throw new Error('--password must not be empty');
    const iterations = parsed.options.get('iterations');
    const passwordParams =
        iterations === undefined
            ? DEFAULT_PASSWORD_PARAMS
            : {...DEFAULT_PASSWORD_PARAMS, iterations: Number(iterations)};
    if (!Number.isInteger(passwordParams.iterations) || passwordParams.iterations < 1) {
        throw new Error('--iterations must be a positive integer');
    }
    return {
        userName,
        password,
        passwordParams,
        strict: parsed.flags.has('strict'),
        force: parsed.flags.has('force'),
    };
}

/** A row of `blong-dev user list`. */
export interface IUserSummary {
    userName: string;
    userId: string;
    emailAddress: string | null;
    isActive: number;
    roles: string[];
    canLogin: boolean;
}

/** The minimal client surface `userAdd` needs (injectable for tests). */
export interface IUserClient extends IAdminConnection {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

/** A `mysql2`-style connection factory (injectable for tests). */
export type IConnectUser = (config: IConnectionInfo) => Promise<IUserClient>;

/** What `userAdd` did. */
export interface IUserAddResult {
    userName: string;
    userId: string;
    /** False when an existing user was updated (`--update`). */
    created: boolean;
    roles: string[];
    /** True when the granted roles reach `accessLogin` (the login gate). */
    canLogin: boolean;
    /** The minimum length the database's active policy asks for. */
    policyMinLength: number;
}

/** What `userPasswd` did. */
export interface IUserPasswdResult {
    userName: string;
    userId: string;
    roles: string[];
    /** True when the granted roles reach `accessLogin` (the login gate). */
    canLogin: boolean;
    /** The minimum length the database's active policy asks for. */
    policyMinLength: number;
}

/** Resolve role names to their hex ids, failing with the names that do exist. */
async function resolveRoles(client: IUserClient, roleNames: string[]): Promise<string[]> {
    if (!roleNames.length) return [];
    const ids: string[] = [];
    const missing: string[] = [];
    for (const roleName of roleNames) {
        const [rows] = await client.query<Array<{roleId: unknown}>>(
            'SELECT ar.roleId AS roleId FROM access_role ar' +
                ' JOIN core_resource r ON r.resourceId = ar.roleId' +
                ' WHERE r.resourceName = ? LIMIT 1',
            [roleName],
        );
        const row = rows[0];
        if (row) ids.push(hexOf(row.roleId));
        else missing.push(roleName);
    }
    if (missing.length) {
        const [available] = await client.query<Array<{resourceName: string}>>(
            'SELECT r.resourceName AS resourceName FROM access_role ar' +
                ' JOIN core_resource r ON r.resourceId = ar.roleId' +
                ' ORDER BY r.resourceName',
        );
        const names = available.map(row => row.resourceName).join(', ');
        throw new Error(
            `unknown role(s): ${missing.join(', ')}` + (names ? ` — available: ${names}` : ''),
        );
    }
    return ids;
}

/**
 * Ensure the `access.user` resource type exists and return its id.
 *
 * `core_type.typeId` is a `bigint unsigned auto_increment`, so a missing type is
 * created by inserting the alias and reading the allocated id back — the
 * framework's `ensureType` does the same.
 */
async function ensureUserType(client: IUserClient): Promise<number> {
    const [rows] = await client.query<Array<{typeId: number | string}>>(
        'SELECT typeId AS typeId FROM core_type WHERE typeAlias = ? LIMIT 1',
        [USER_TYPE_ALIAS],
    );
    const found = rows[0];
    if (found) return Number(found.typeId);
    const [header] = await client.query<{insertId?: number}>(
        'INSERT INTO core_type (typeAlias) VALUES (?)',
        [USER_TYPE_ALIAS],
    );
    const typeId = Number(header?.insertId);
    if (!Number.isInteger(typeId) || typeId < 1) {
        throw new Error(`could not create the ${USER_TYPE_ALIAS} type`);
    }
    return typeId;
}

/**
 * Write the password credential of a user.
 *
 * `replace` removes every password row (what `access.user.add`'s credential sync
 * does); `rotate` deactivates them and inserts the new one, which is what the
 * realm's own `access.profile.password.change` does — the caller keeps a history
 * and the login reads the active row.
 */
async function writePassword(
    client: IUserClient,
    userId: Buffer,
    password: string,
    params: IPasswordParams,
    mode: 'replace' | 'rotate' = 'replace',
): Promise<void> {
    const salt = randomUUID();
    const {hash} = hashPassword(password, salt, params);
    if (mode === 'rotate') {
        await client.query(
            "UPDATE access_credential SET isActive = 0 WHERE userId = ? AND credentialType = 'password'",
            [userId],
        );
    } else {
        await client.query(
            "DELETE FROM access_credential WHERE userId = ? AND credentialType = 'password'",
            [userId],
        );
    }
    await client.query(
        'INSERT INTO access_credential' +
            ' (userId, credentialType, credentialHash, credentialSalt, credentialParamsJSON, isActive)' +
            ' VALUES (?, ?, ?, ?, ?, 1)',
        [userId, 'password', hash, salt, JSON.stringify(params)],
    );
}

/** The password rules the database itself carries (`access.policy`). */
export interface IUserPasswordPolicy {
    minLength: number;
    params: IPasswordParams;
}

/**
 * Read the active password policy: the rules the portal enforces when a user
 * changes a password, so a credential this command writes obeys the same ones.
 *
 * A database seeded without a policy (or with a policy that carries no digest
 * parameters the CLI understands) falls back to the framework defaults, which is
 * what the realm does too — verification re-uses the parameters stored on the row,
 * so the two only have to agree with themselves.
 */
async function readPasswordPolicy(client: IUserClient): Promise<IUserPasswordPolicy> {
    const [rows] = await client.query<
        Array<{minLength?: number | null; credentialParams?: unknown}>
    >(
        'SELECT minLength AS minLength, credentialParamsJSON AS credentialParams FROM access_policy' +
            " WHERE credentialType = 'password' AND isActive = 1 LIMIT 1",
    );
    const row = rows[0] ?? {};
    const minLength = Number(row.minLength ?? 8) || 8;
    let stored: Partial<IPasswordParams> = {};
    const raw = row.credentialParams;
    if (typeof raw === 'string') {
        try {
            stored = JSON.parse(raw) as Partial<IPasswordParams>;
        } catch {
            stored = {};
        }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        stored = raw as Partial<IPasswordParams>;
    }
    return {minLength, params: {...DEFAULT_PASSWORD_PARAMS, ...stored}};
}

/**
 * The digest parameters a write should use: an explicit `--iterations` wins, then
 * the policy, then the framework defaults.
 */
export function effectivePasswordParams(
    policy: IUserPasswordPolicy,
    explicit: IPasswordParams,
): IPasswordParams {
    const overridden = explicit.iterations !== DEFAULT_PASSWORD_PARAMS.iterations;
    return overridden ? explicit : policy.params;
}

/**
 * Refuse a secret shorter than the policy asks for, when the caller asked to be
 * held to it (`--strict`).
 *
 * The default is to warn and write it: a deployment bootstrapped with a throwaway
 * password is a deliberate act, and the database's `minLength` governs the page
 * that changes a password rather than the row itself — a short secret authenticates
 * perfectly well. Refusing silently in the other direction would be worse: an
 * operator locked out of a portal with no password page has no second route.
 */
function assertSecretAcceptable(
    secret: string,
    policy: IUserPasswordPolicy,
    options: {strict: boolean},
): void {
    if (secret.length >= policy.minLength) return;
    if (!options.strict) return;
    throw new Error(
        `the password is ${secret.length} characters and the database policy asks for at least ` +
            `${policy.minLength} (drop --strict to set it anyway)`,
    );
}

/** Replace a user's `hasRole` edges with the given role ids and rebuild the paths. */
async function writeRoles(
    client: IUserClient,
    userId: Buffer,
    roleHexIds: string[],
): Promise<void> {
    await client.query(
        "DELETE FROM core_triple WHERE subjectId = ? AND predicateName = 'hasRole'",
        [userId],
    );
    for (const roleHex of roleHexIds) {
        await client.query(
            "INSERT INTO core_triple (subjectId, predicateName, objectId) VALUES (?, 'hasRole', ?)" +
                ' ON DUPLICATE KEY UPDATE subjectId = subjectId',
            [userId, Buffer.from(roleHex, 'hex')],
        );
    }
    // The stored procedure materializes the effective permission paths a token's
    // `per` mask and the authorization gate read; `access.user.add` calls it in
    // the same transaction (`realm/blong-access/adapter/db/accessModel.ts`).
    await client.query('CALL access_pathRefresh()');
}

/** The role names a user holds, from its `hasRole` edges. */
async function currentRoles(client: IUserClient, userIdHex: string): Promise<string[]> {
    const [rows] = await client.query<Array<{roleName: string}>>(
        'SELECT o.resourceName AS roleName FROM core_triple t' +
            ' JOIN core_resource o ON o.resourceId = t.objectId' +
            " WHERE t.subjectId = ? AND t.predicateName = 'hasRole' ORDER BY o.resourceName",
        [Buffer.from(userIdHex, 'hex')],
    );
    return rows.map(row => row.roleName);
}

/** True when the user's materialized permissions include the login action. */
async function canLogin(client: IUserClient, userIdHex: string): Promise<boolean> {
    const [rows] = await client.query<Array<{one: number}>>(
        'SELECT 1 AS one FROM access_effectiveActionPath p' +
            ' JOIN core_resource d ON d.resourceId = p.destinationId' +
            " WHERE p.originId = ? AND p.pathType = 'access.effectiveAction'" +
            ' AND d.resourceName = ? LIMIT 1',
        [Buffer.from(userIdHex, 'hex'), LOGIN_ACTION],
    );
    return rows.length > 0;
}

/**
 * Create (or, with `--update`, rewrite) an access user.
 *
 * Everything happens in one transaction: `access.user.add` used to commit its
 * rows one by one, and a failure in the middle left a user whose credential was
 * stored and whose roles were not, with the caller only seeing an error.
 */
export async function userAdd(
    connection: IConnectionInfo,
    options: IUserAddOptions,
    connect: IConnectUser = createConnection as unknown as IConnectUser,
): Promise<IUserAddResult> {
    const client = await connect(connection);
    try {
        await client.beginTransaction();
        const typeId = await ensureUserType(client);
        const [found] = await client.query<Array<{resourceId: unknown}>>(
            'SELECT resourceId AS resourceId FROM core_resource WHERE typeId = ? AND resourceName = ? LIMIT 1',
            [typeId, options.userName],
        );
        let userIdHex = found[0] ? hexOf(found[0].resourceId) : '';
        let created = false;
        if (userIdHex && !options.update) {
            throw new Error(
                `user "${options.userName}" already exists — pass --update to reset its password and roles`,
            );
        }
        const roleHexIds = await resolveRoles(client, options.roles);
        const policy = await readPasswordPolicy(client);
        assertSecretAcceptable(options.password, policy, options);
        if (!userIdHex) {
            userIdHex = randomUUID().replaceAll('-', '').toUpperCase();
            created = true;
            await client.query(
                'INSERT INTO core_resource (resourceId, resourceName, typeId) VALUES (?, ?, ?)',
                [Buffer.from(userIdHex, 'hex'), options.userName, typeId],
            );
            await client.query(
                'INSERT INTO access_user (userId, emailAddress, isActive) VALUES (?, ?, ?)',
                [
                    Buffer.from(userIdHex, 'hex'),
                    options.emailAddress ?? null,
                    options.isActive ? 1 : 0,
                ],
            );
        } else {
            // An existing row keeps its email unless one was given, and always
            // takes the requested active flag — `--update` is how a locked-out
            // account is re-enabled.
            await client.query(
                'UPDATE access_user SET emailAddress = COALESCE(?, emailAddress), isActive = ? WHERE userId = ?',
                [
                    options.emailAddress ?? null,
                    options.isActive ? 1 : 0,
                    Buffer.from(userIdHex, 'hex'),
                ],
            );
        }
        await writePassword(
            client,
            Buffer.from(userIdHex, 'hex'),
            options.password,
            effectivePasswordParams(policy, options.passwordParams),
        );
        // Without `--role` the roles are left alone: `--update` is how a password is
        // reset or a locked-out account re-enabled, and a partial command that
        // silently stripped every grant would lock the account out in a new way.
        if (roleHexIds.length) await writeRoles(client, Buffer.from(userIdHex, 'hex'), roleHexIds);
        const roles = await currentRoles(client, userIdHex);
        const loginReady = await canLogin(client, userIdHex);
        await client.commit();
        return {
            userName: options.userName,
            userId: userIdHex,
            created,
            roles,
            canLogin: loginReady,
            policyMinLength: policy.minLength,
        };
    } catch (error) {
        await client.rollback().catch(() => {});
        throw error;
    } finally {
        await client.end().catch(() => {});
    }
}

/**
 * Change a user's password.
 *
 * The credential is **rotated**: the stored password rows are deactivated and a new
 * active one is inserted, which is exactly what `access.profile.password.change`
 * does when a user changes their own password. The login reads the active row, so
 * the previous secret stops working the moment this commits, and the history of
 * hashes stays visible instead of being overwritten.
 *
 * This exists because a deployment may reach no page that changes a password — the
 * portal's profile screen is one, and a suite that does not ship it leaves a
 * forgotten password with no route back in. @@D-650
 */
export async function userPasswd(
    connection: IConnectionInfo,
    options: IUserPasswdOptions,
    connect: IConnectUser = createConnection as unknown as IConnectUser,
): Promise<IUserPasswdResult> {
    const client = await connect(connection);
    try {
        await client.beginTransaction();
        const typeId = await ensureUserType(client);
        const [found] = await client.query<Array<{resourceId: unknown}>>(
            'SELECT resourceId AS resourceId FROM core_resource WHERE typeId = ? AND resourceName = ? LIMIT 1',
            [typeId, options.userName],
        );
        const userIdHex = found[0] ? hexOf(found[0].resourceId) : '';
        if (!userIdHex) {
            throw new Error(
                `user "${options.userName}" not found — \`blong-dev user list\` shows the logins this database holds`,
            );
        }
        const policy = await readPasswordPolicy(client);
        assertSecretAcceptable(options.password, policy, options);
        await writePassword(
            client,
            Buffer.from(userIdHex, 'hex'),
            options.password,
            effectivePasswordParams(policy, options.passwordParams),
            'rotate',
        );
        const roles = await currentRoles(client, userIdHex);
        const loginReady = await canLogin(client, userIdHex);
        await client.commit();
        return {
            userName: options.userName,
            userId: userIdHex,
            roles,
            canLogin: loginReady,
            policyMinLength: policy.minLength,
        };
    } catch (error) {
        await client.rollback().catch(() => {});
        throw error;
    } finally {
        await client.end().catch(() => {});
    }
}

/** List access users (the discovery step `user add` exists to make unnecessary). */
export async function userList(
    connection: IConnectionInfo,
    filter: {roleName?: string},
    connect: IConnectUser = createConnection as unknown as IConnectUser,
): Promise<IUserSummary[]> {
    const client = await connect(connection);
    try {
        const [rows] = await client.query<Array<Record<string, unknown>>>(
            'SELECT r.resourceName AS userName, u.userId AS userId, u.emailAddress AS emailAddress,' +
                ' u.isActive AS isActive FROM access_user u' +
                ' JOIN core_resource r ON r.resourceId = u.userId' +
                ' JOIN core_type t ON t.typeId = r.typeId AND t.typeAlias = ?' +
                ' ORDER BY r.resourceName',
            [USER_TYPE_ALIAS],
        );
        const result: IUserSummary[] = [];
        for (const row of rows) {
            const userIdHex = hexOf(row.userId);
            const roles = await currentRoles(client, userIdHex);
            const summary: IUserSummary = {
                userName: String(row.userName),
                userId: userIdHex,
                emailAddress: (row.emailAddress as string | null) ?? null,
                isActive: Number(row.isActive ?? 0),
                roles,
                canLogin: await canLogin(client, userIdHex),
            };
            if (filter.roleName && !roles.includes(filter.roleName)) continue;
            result.push(summary);
        }
        return result;
    } finally {
        await client.end().catch(() => {});
    }
}

function writeUserUsage(stream: NodeJS.WriteStream): void {
    stream.write('Usage:\n');
    stream.write(
        '  blong-dev user add <userName> --password <secret> [--role Admin,Manager]\n' +
            '                      [--email <address>] [--inactive] [--update] [--iterations n]\n' +
            '  blong-dev user passwd <userName> --password <newSecret> [--iterations n] [--strict]\n' +
            '  blong-dev user list [--role <name>]\n' +
            '  DB connection: .blong_devrc (as `blong-dev sql`) plus\n' +
            '    [--config key] [--database db] [--host h] [--port p] [--user dbUser]\n' +
            '    [--db-password dbSecret] [--suite s] [--output json|pretty]\n' +
            "  --password is the NEW user's login secret; the database password is --db-password.\n" +
            '  A secret shorter than the active policy warns unless --strict (refuse) or --force (quiet).\n',
    );
}

/** Format one user as a line for human output. */
function formatUser(user: IUserSummary): string {
    const state = user.isActive ? 'active' : 'inactive';
    const login = user.canLogin ? 'login' : 'no login';
    const email = user.emailAddress ? ` <${user.emailAddress}>` : '';
    return `${user.userName}${email}  [${state}, ${login}]  roles: ${
        user.roles.length ? user.roles.join(', ') : '(none)'
    }\n`;
}

/** Warn when the secret is weaker than the database's own policy asks for. */
function warnWeakSecret(secret: string, policyMinLength: number, force: boolean): void {
    if (force || secret.length >= policyMinLength) return;
    process.stderr.write(
        `blong-dev user: warning: the password is ${secret.length} characters, the database policy ` +
            `asks for at least ${policyMinLength} (--strict refuses, --force silences)\n`,
    );
}

export async function user(args: string[]): Promise<void> {
    const verb = args[0];
    const parsed = parseArgs(args.slice(1));
    if (!verb || verb === '--help' || verb === 'help') {
        writeUserUsage(verb ? process.stdout : process.stderr);
        if (!verb) process.exitCode = 1;
        return;
    }
    const outputRaw =
        parsed.options.get('output') ?? (process.stdout.isTTY === true ? 'pretty' : 'json');
    const output = ['json', 'pretty'].includes(outputRaw) ? outputRaw : undefined;
    if (!output) {
        process.stderr.write(
            `blong-dev user: invalid --output "${outputRaw}" (use json | pretty)\n`,
        );
        process.exitCode = 1;
        return;
    }
    const {connection, derived} = readConnection(databaseArgs(parsed));
    try {
        if (derived) await ensureDatabase(connection);
        if (verb === 'add') {
            const options = readUserAddOptions(parsed);
            const result = await userAdd(connection, options);
            warnWeakSecret(options.password, result.policyMinLength, options.force);
            if (output === 'json') {
                process.stdout.write(JSON.stringify(result, null, 2) + '\n');
            } else {
                process.stdout.write(
                    `${result.created ? 'created' : 'updated'} user "${result.userName}" (${result.userId})\n` +
                        `roles: ${result.roles.length ? result.roles.join(', ') : '(none)'}\n` +
                        `login: ${result.canLogin ? 'allowed' : 'NOT allowed — no granted role reaches accessLogin'}\n`,
                );
            }
            return;
        }
        if (verb === 'passwd') {
            const options = readUserPasswdOptions(parsed);
            const result = await userPasswd(connection, options);
            warnWeakSecret(options.password, result.policyMinLength, options.force);
            if (output === 'json') {
                process.stdout.write(JSON.stringify(result, null, 2) + '\n');
            } else {
                process.stdout.write(
                    `password changed for user "${result.userName}" (${result.userId})\n` +
                        `login: ${result.canLogin ? 'allowed' : 'NOT allowed — no granted role reaches accessLogin'}\n`,
                );
            }
            return;
        }
        if (verb === 'list') {
            const users = await userList(connection, {roleName: parsed.options.get('role')});
            if (output === 'json') {
                process.stdout.write(JSON.stringify(users, null, 2) + '\n');
            } else if (!users.length) {
                process.stdout.write('no users\n');
            } else {
                for (const one of users) process.stdout.write(formatUser(one));
            }
            return;
        }
        process.stderr.write(`blong-dev user: unknown verb "${verb}"\n`);
        writeUserUsage(process.stderr);
        process.exitCode = 1;
    } catch (error) {
        process.stderr.write(`blong-dev user: ${(error as Error).message ?? String(error)}\n`);
        process.exitCode = 1;
    }
}
