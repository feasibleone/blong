/**
 * Unit tests for the `blong-dev user` command (commands/user.ts).
 *
 * The write path needs a live MySQL backend (covered by the command itself
 * against a dev database); these tests cover the pure parts — option parsing,
 * role-name splitting, the `--password` vs `--db-password` split, the digest,
 * and the row-level behaviour of `userAdd` against a scripted fake connection.
 */

import {test} from 'tap';

import {parseArgs} from './log.ts';
import {
    DEFAULT_PASSWORD_PARAMS,
    databaseArgs,
    hashPassword,
    parseRoleNames,
    readUserAddOptions,
    readUserPasswdOptions,
    userAdd,
    userPasswd,
    uuidBuffer,
    type IUserClient,
} from './user.ts';

test('parseRoleNames splits, trims and de-duplicates', t => {
    t.same(parseRoleNames('Admin, Manager'), ['Admin', 'Manager'], 'comma separated');
    t.same(parseRoleNames('Admin Manager'), ['Admin', 'Manager'], 'whitespace separated');
    t.same(parseRoleNames(' Admin ,, Admin ,Customer '), ['Admin', 'Customer'], 'duplicates drop');
    t.same(parseRoleNames(undefined), [], 'absent means no roles');
    t.same(parseRoleNames(''), [], 'empty means no roles');
    t.end();
});

test('uuidBuffer round-trips a UUID as 16 bytes', t => {
    const buffer = uuidBuffer('A244124E-8104-45C9-8C77-499B767CBB4C');
    t.equal(buffer.length, 16, 'is a 16-byte binary column value');
    t.equal(buffer.toString('hex').toUpperCase(), 'A244124E810445C98C77499B767CBB4C', 'is the id');
    t.end();
});

test('hashPassword derives a verifiable digest and reports its parameters', t => {
    const params = {...DEFAULT_PASSWORD_PARAMS, iterations: 2};
    const a = hashPassword('secret', 'salt', params);
    const b = hashPassword('secret', 'salt', params);
    t.equal(a.hash, b.hash, 'is deterministic for a salt and parameters');
    t.not(hashPassword('other', 'salt', params).hash, a.hash, 'a different password differs');
    t.equal(a.hash.length, params.keyLength * 2, 'hex digest has keyLength bytes');
    t.same(a.params, params, 'the parameters that produced it are returned for storing');
    t.end();
});

test('readUserAddOptions reads the user, secret, roles and flags', t => {
    const parsed = parseArgs([
        'admin',
        '--password',
        'secret123',
        '--role',
        'Admin,Manager',
        '--email',
        'admin@example.com',
    ]);
    const options = readUserAddOptions(parsed);
    t.equal(options.userName, 'admin', 'the positional is the login name');
    t.equal(options.password, 'secret123', '--password is the new secret');
    t.same(options.roles, ['Admin', 'Manager'], '--role splits');
    t.equal(options.emailAddress, 'admin@example.com', '--email is carried');
    t.equal(options.isActive, true, 'active unless --inactive');
    t.equal(options.update, false, 'refuses an existing user unless --update');
    t.same(options.passwordParams, DEFAULT_PASSWORD_PARAMS, 'framework digest parameters');
    t.end();
});

test('readUserAddOptions honours --inactive, --update and --iterations', t => {
    const options = readUserAddOptions(
        parseArgs(['admin', '--password', 'secret', '--inactive', '--update', '--iterations', '1']),
    );
    t.equal(options.isActive, false, '--inactive deactivates');
    t.equal(options.update, true, '--update allows an existing user');
    t.equal(options.passwordParams.iterations, 1, '--iterations overrides the digest cost');
    t.same(options.roles, [], 'no --role means no roles');
    t.end();
});

test('readUserAddOptions rejects a missing name, secret or bad iterations', t => {
    t.throws(
        () => readUserAddOptions(parseArgs(['--password', 'x'])),
        /a user name is required/,
        'a user name is required',
    );
    t.throws(
        () => readUserAddOptions(parseArgs(['admin'])),
        /--password <secret> is required/,
        'a secret is required',
    );
    t.throws(
        () => readUserAddOptions(parseArgs(['admin', '--password'])),
        /--password must not be empty/,
        'an empty secret is refused',
    );
    t.throws(
        () => readUserAddOptions(parseArgs(['admin', '--password', 'x', '--iterations', '0'])),
        /--iterations must be a positive integer/,
        'a non-positive iteration count is refused',
    );
    t.throws(
        () => readUserAddOptions(parseArgs(['two words', '--password', 'x'])),
        /must not contain whitespace/,
        'the login name cannot carry whitespace',
    );
    t.end();
});

test('databaseArgs maps --db-password and keeps --password for the new user', t => {
    const parsed = parseArgs([
        'admin',
        '--password',
        'userSecret',
        '--db-password',
        'dbSecret',
        '--db-user',
        'root',
        '--database',
        'blong-sport',
    ]);
    const db = databaseArgs(parsed);
    t.equal(db.options.get('password'), 'dbSecret', 'the DB password comes from --db-password');
    t.equal(db.options.get('user'), 'root', 'the DB user comes from --db-user');
    t.equal(db.options.get('database'), 'blong-sport', 'the database is untouched');
    t.equal(parsed.options.get('password'), 'userSecret', 'the caller keeps its own options');
    t.end();
});

/**
 * A scripted fake connection: every `query` is answered by the first handler
 * whose pattern matches, so the test states the rows each statement returns
 * instead of needing a database.
 */
function fakeClient(handlers: Array<{match: RegExp; rows?: unknown; header?: unknown}>): {
    client: IUserClient;
    calls: Array<{sql: string; values: unknown}>;
} {
    const calls: Array<{sql: string; values: unknown}> = [];
    const client = {
        async query(sql: string, values?: unknown) {
            calls.push({sql: sql.replaceAll(/\s+/g, ' ').trim(), values});
            for (const handler of handlers) {
                if (handler.match.test(sql)) return [handler.rows ?? handler.header ?? [], []];
            }
            return [[], []];
        },
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        async end() {},
    } as unknown as IUserClient;
    return {client, calls};
}

const USER_TYPE_ROW = {match: /FROM core_type/, rows: [{typeId: 6}]};
const NO_USER = {match: /FROM core_resource WHERE typeId = \? AND resourceName/, rows: []};
const ROLE_ROW = {match: /FROM access_role ar JOIN core_resource r/, rows: [{roleId: 'AA'}]};
const HELD_ROLES = {match: /AS roleName FROM core_triple/, rows: [{roleName: 'Admin'}]};
const LOGIN_ROW = {match: /FROM access_effectiveActionPath/, rows: [{one: 1}]};

const baseOptions = {
    userName: 'admin',
    password: 'secret123',
    roles: ['Admin'],
    isActive: true,
    update: false,
    passwordParams: DEFAULT_PASSWORD_PARAMS,
    strict: false,
    force: false,
};

test('userAdd creates the resource, entity row, credential and role edge', async t => {
    const {client, calls} = fakeClient([USER_TYPE_ROW, NO_USER, ROLE_ROW, HELD_ROLES, LOGIN_ROW]);
    const result = await userAdd({}, baseOptions, async () => client);
    t.equal(result.created, true, 'reports the user as created');
    t.equal(result.userName, 'admin', 'reports the login name');
    t.same(result.roles, ['Admin'], 'reports the roles it granted');
    t.equal(result.canLogin, true, 'reports that the login gate is satisfied');
    const sql = calls.map(c => c.sql);
    t.ok(
        sql.some(s => s.startsWith('INSERT INTO core_resource (resourceId, resourceName, typeId)')),
        'writes the resource that carries the login name',
    );
    t.ok(
        sql.some(s => s.startsWith('INSERT INTO access_user')),
        'writes the entity row',
    );
    t.ok(
        sql.some(s => s.startsWith('DELETE FROM access_credential')),
        'replaces any password row',
    );
    t.ok(
        sql.some(s => s.startsWith('INSERT INTO access_credential')),
        'writes the password digest',
    );
    t.ok(
        sql.some(s => s.includes("predicateName = 'hasRole'")),
        'writes the role edge',
    );
    t.ok(
        sql.some(s => s === 'CALL access_pathRefresh()'),
        'rebuilds the effective paths',
    );
    t.ok(
        calls.some(c => c.values && JSON.stringify(c.values).includes('admin')),
        'names it admin',
    );
    t.end();
});

test('userAdd refuses an existing user without --update', async t => {
    const {client} = fakeClient([
        USER_TYPE_ROW,
        {
            match: /FROM core_resource WHERE typeId = \? AND resourceName/,
            rows: [{resourceId: 'AA'.repeat(16)}],
        },
        ROLE_ROW,
    ]);
    await t.rejects(
        userAdd({}, baseOptions, async () => client),
        /already exists — pass --update/,
        'the caller is told how to update instead',
    );
    t.end();
});

test('userAdd updates the existing user with --update instead of creating one', async t => {
    const {client, calls} = fakeClient([
        USER_TYPE_ROW,
        {
            match: /FROM core_resource WHERE typeId = \? AND resourceName/,
            rows: [{resourceId: 'BB'.repeat(16)}],
        },
        ROLE_ROW,
        HELD_ROLES,
        LOGIN_ROW,
    ]);
    const result = await userAdd({}, {...baseOptions, update: true}, async () => client);
    t.equal(result.created, false, 'reports the user as updated');
    const sql = calls.map(c => c.sql);
    t.notOk(
        sql.some(s => s.startsWith('INSERT INTO core_resource')),
        'no second resource row',
    );
    t.ok(
        sql.some(s => s.startsWith('UPDATE access_user')),
        'updates the entity row',
    );
    t.ok(
        sql.some(s => s.startsWith('INSERT INTO access_credential')),
        're-sets the password',
    );
    t.end();
});

test('userAdd fails on an unknown role and names the ones that exist', async t => {
    const {client} = fakeClient([
        USER_TYPE_ROW,
        NO_USER,
        {match: /SELECT ar.roleId AS roleId/, rows: []},
        {match: /AS resourceName FROM access_role/, rows: [{resourceName: 'Admin'}]},
    ]);
    await t.rejects(
        userAdd({}, {...baseOptions, roles: ['Nope']}, async () => client),
        /unknown role\(s\): Nope — available: Admin/,
        'an unknown role is an error, not a silent no-op',
    );
    t.end();
});

test('userAdd reports a user whose roles cannot reach the login action', async t => {
    const {client} = fakeClient([
        USER_TYPE_ROW,
        NO_USER,
        ROLE_ROW,
        HELD_ROLES,
        {match: /FROM access_effectiveActionPath/, rows: []},
    ]);
    const result = await userAdd({}, baseOptions, async () => client);
    t.equal(result.canLogin, false, 'the login gate is reported as unsatisfied');
    t.end();
});

test('userAdd --update without --role leaves the existing grants alone', async t => {
    const {client, calls} = fakeClient([
        USER_TYPE_ROW,
        {
            match: /FROM core_resource WHERE typeId = \? AND resourceName/,
            rows: [{resourceId: 'CC'.repeat(16)}],
        },
        HELD_ROLES,
        LOGIN_ROW,
    ]);
    const result = await userAdd({}, {...baseOptions, roles: [], update: true}, async () => client);
    const sql = calls.map(c => c.sql);
    t.notOk(
        sql.some(
            s =>
                s.includes("predicateName = 'hasRole' AND") ||
                s.includes('DELETE FROM core_triple'),
        ),
        'no role edge is touched',
    );
    t.same(result.roles, ['Admin'], 'the roles it reports are the ones the user holds');
    t.end();
});

test('readUserPasswdOptions reads the name and the new secret', t => {
    const options = readUserPasswdOptions(parseArgs(['admin', '--password', 'newSecret1']));
    t.equal(options.userName, 'admin', 'the positional is the login name');
    t.equal(options.password, 'newSecret1', '--password is the new secret');
    t.equal(options.strict, false, 'the policy only warns by default');
    t.same(options.passwordParams, DEFAULT_PASSWORD_PARAMS, 'framework digest parameters');
    t.throws(
        () => readUserPasswdOptions(parseArgs(['admin'])),
        /--password <newSecret> is required/,
        'a new secret is required',
    );
    t.throws(
        () => readUserPasswdOptions(parseArgs(['--password', 'x'])),
        /a user name is required/,
        'a user name is required',
    );
    t.end();
});

test('userPasswd rotates the credential instead of replacing it', async t => {
    const {client, calls} = fakeClient([
        USER_TYPE_ROW,
        {
            match: /FROM core_resource WHERE typeId = \? AND resourceName/,
            rows: [{resourceId: 'DD'.repeat(16)}],
        },
        HELD_ROLES,
        LOGIN_ROW,
    ]);
    const result = await userPasswd(
        {},
        {
            userName: 'admin',
            password: 'newSecret1',
            passwordParams: DEFAULT_PASSWORD_PARAMS,
            strict: false,
            force: false,
        },
        async () => client,
    );
    const sql = calls.map(c => c.sql);
    t.ok(
        sql.some(s => s.startsWith('UPDATE access_credential SET isActive = 0')),
        'deactivates the previous password the way a self-service change does',
    );
    t.notOk(
        sql.some(s => s.startsWith('DELETE FROM access_credential')),
        'deletes nothing',
    );
    t.ok(
        sql.some(s => s.startsWith('INSERT INTO access_credential')),
        'inserts the new digest',
    );
    t.equal(result.userName, 'admin', 'reports the login it changed');
    t.equal(result.canLogin, true, 'reports the login gate');
    t.end();
});

test('userPasswd fails with the list hint when the user does not exist', async t => {
    const {client} = fakeClient([USER_TYPE_ROW, NO_USER]);
    await t.rejects(
        userPasswd(
            {},
            {
                userName: 'ghost',
                password: 'newSecret1',
                passwordParams: DEFAULT_PASSWORD_PARAMS,
                strict: false,
                force: false,
            },
            async () => client,
        ),
        /user "ghost" not found — `blong-dev user list` shows the logins this database holds/,
        'a missing user is reported with the way to find the real names',
    );
    t.end();
});

test('userPasswd honours the policy minLength when --strict is given', async t => {
    const {client} = fakeClient([
        USER_TYPE_ROW,
        {
            match: /FROM core_resource WHERE typeId = \? AND resourceName/,
            rows: [{resourceId: 'EE'.repeat(16)}],
        },
        {match: /FROM access_policy/, rows: [{minLength: 12, credentialParams: null}]},
        HELD_ROLES,
        LOGIN_ROW,
    ]);
    await t.rejects(
        userPasswd(
            {},
            {
                userName: 'admin',
                password: 'short',
                passwordParams: DEFAULT_PASSWORD_PARAMS,
                strict: true,
                force: false,
            },
            async () => client,
        ),
        /the password is 5 characters and the database policy asks for at least 12/,
        'the policy is enforced when it is asked for',
    );
    t.end();
});

test('a policy with digest parameters decides how the secret is hashed', async t => {
    const {client, calls} = fakeClient([
        USER_TYPE_ROW,
        {
            match: /FROM core_resource WHERE typeId = \? AND resourceName/,
            rows: [{resourceId: 'FF'.repeat(16)}],
        },
        {
            match: /FROM access_policy/,
            rows: [
                {
                    minLength: 8,
                    credentialParams: JSON.stringify({iterations: 2, keyLength: 32}),
                },
            ],
        },
        HELD_ROLES,
        LOGIN_ROW,
    ]);
    const result = await userPasswd(
        {},
        {
            userName: 'admin',
            password: 'newSecret1',
            passwordParams: DEFAULT_PASSWORD_PARAMS,
            strict: true,
            force: false,
        },
        async () => client,
    );
    t.equal(result.policyMinLength, 8, 'the policy length is reported');
    const insert = calls.find(c => c.sql.startsWith('INSERT INTO access_credential'));
    const stored = JSON.parse(String((insert?.values as unknown[])[4])) as {
        iterations: number;
        keyLength: number;
    };
    t.equal(stored.iterations, 2, 'the policy iteration count is used');
    t.equal(stored.keyLength, 32, 'the policy key length is used');
    t.end();
});
