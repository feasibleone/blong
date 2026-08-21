/**
 * Unit tests for the `blong-dev sql` command helpers (commands/sql.ts).
 *
 * The DB-connection/query execution path needs a live MySQL backend (covered by
 * CI/manual runs); these tests cover the pure helpers: `.blong_devrc` parsing,
 * dot-path lookup, and connection resolution with CLI overrides.
 */

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {parseArgs} from './log.ts';
import {
    currentUser,
    devDbName,
    ensureDatabase,
    getPath,
    isMultiResult,
    parseDevRc,
    readConnection,
    resolveSuite,
    type IConnect,
} from './sql.ts';

test('parseDevRc parses JSON-with-comments', t => {
    const config = parseDevRc(
        '{\n    // comment\n    "srv": {"db": {"knex": {"connection": {"host": "db.local"}}}}\n}',
    );
    t.same(
        getPath(config, 'srv.db.knex.connection'),
        {host: 'db.local'},
        'JSON-with-comments parses and full dot path resolves',
    );
    t.end();
});

test('parseDevRc parses YAML', t => {
    const config = parseDevRc(
        'srv:\n  db:\n    knex:\n      connection:\n        host: yaml.local\n        port: 3307\n',
    );
    t.equal(
        (getPath(config, 'srv.db') as {knex: {connection: {host: string}}}).knex.connection.host,
        'yaml.local',
        'yaml parsed and path resolved',
    );
    t.end();
});

test('getPath returns undefined for missing paths', t => {
    t.equal(getPath({}, 'srv.db'), undefined, 'empty config');
    t.equal(getPath({srv: {}}, 'srv.db.knex'), undefined, 'partial path');
    t.end();
});

test('readConnection reads .blong_devrc and applies CLI overrides', t => {
    const dir = join(tmpdir(), `blong-dev-sql-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, '.blong_devrc'),
        'srv:\n  db:\n    knex:\n      connection:\n        host: devrc.local\n        user: devuser\n        database: devdb\n',
    );
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const fromDevRc = readConnection(parseArgs(['SELECT 1']));
    t.equal(fromDevRc.connection.host, 'devrc.local', 'host from devrc');
    t.equal(fromDevRc.connection.user, 'devuser', 'user from devrc');
    t.equal(fromDevRc.connection.database, 'devdb', 'database from devrc');
    t.match(fromDevRc.source, /srv\.db/, 'source mentions the config key');

    const withOverrides = readConnection(
        parseArgs(['SELECT 1', '--host', 'cli.local', '--port', '3308', '--password', 'secret']),
    );
    t.equal(withOverrides.connection.host, 'cli.local', '--host overrides devrc');
    t.equal(withOverrides.connection.port, 3308, '--port parsed as number');
    t.equal(withOverrides.connection.user, 'devuser', 'user still from devrc');
    t.equal(withOverrides.connection.password, 'secret', '--password override');

    const otherKey = readConnection(parseArgs(['SELECT 1', '--config', 'mysql.sql']));
    t.equal(otherKey.connection.host, undefined, 'unknown config key yields no connection');
    t.match(otherKey.source, /mysql\.sql/, 'source reflects --config key');
    t.end();
});

test('devDbName mirrors the dev naming pattern', t => {
    t.equal(devDbName('blong-access', 'Kalin'), 'blong-access-kalin', 'lowercases the user');
    t.equal(devDbName('blong$suite', 'kalin'), 'blongsuite-kalin', 'strips $');
    t.equal(devDbName('My Suite', 'Kalin'), 'my_suite-kalin', 'non alnum chars become _');
    t.equal(devDbName('wanples', 'kalin'), 'wanples-kalin', 'simple suite + user');
    t.end();
});

test('resolveSuite — devrc suite key, then package.json name, then --suite', t => {
    const dir = join(tmpdir(), `blong-dev-suite-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, '.blong_devrc'),
        'suite: my-suite\nsrv:\n  db:\n    knex:\n      connection:\n        host: devrc.local\n',
    );
    writeFileSync(join(dir, 'package.json'), '{"name": "@scope/from-pkg"}');
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const config = parseDevRc(readFileSync(join(dir, '.blong_devrc'), 'utf8'));
    t.equal(resolveSuite(config, parseArgs(['SELECT 1'])), 'my-suite', 'devrc suite key wins');
    t.equal(
        resolveSuite({}, parseArgs(['SELECT 1'])),
        'from-pkg',
        'package.json name with scope stripped',
    );
    t.equal(
        resolveSuite({}, parseArgs(['SELECT 1', '--suite', 'cli-suite'])),
        'cli-suite',
        '--suite wins over package.json',
    );
    t.end();
});

test('readConnection derives the dev DB when database is missing', t => {
    const dir = join(tmpdir(), `blong-dev-derive-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, '.blong_devrc'),
        'suite: blong-access\nsrv:\n  db:\n    knex:\n      connection:\n        host: devrc.local\n        user: devuser\n',
    );
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const {connection, source} = readConnection(parseArgs(['SELECT 1']));
    t.equal(connection.host, 'devrc.local', 'host still from devrc');
    t.equal(
        connection.database,
        devDbName('blong-access', currentUser()),
        'database derived from suite + os user',
    );
    t.match(source, /derived dev DB/, 'source flags the derivation');
    t.end();
});

test('readConnection renders ${suite}/${user} templates in a configured database', t => {
    const dir = join(tmpdir(), `blong-dev-template-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, '.blong_devrc'),
        'suite: blong-access\nsrv:\n  db:\n    knex:\n      connection:\n        database: ${suite}-${user}\n',
    );
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const {connection} = readConnection(parseArgs(['SELECT 1']));
    t.equal(connection.database, devDbName('blong-access', currentUser()), 'template rendered');
    t.end();
});

test('readConnection does not derive when --database is provided', t => {
    const dir = join(tmpdir(), `blong-dev-noderive-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, '.blong_devrc'),
        'suite: blong-access\nsrv:\n  db:\n    knex:\n      connection:\n        host: devrc.local\n',
    );
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const {connection, source} = readConnection(
        parseArgs(['SELECT 1', '--database', 'explicit-db']),
    );
    t.equal(connection.database, 'explicit-db', 'CLI database wins, no derivation');
    t.notMatch(source, /derived/, 'source not flagged as derived');
    t.end();
});

test('readConnection falls back to dev defaults when devrc has no srv.db', t => {
    const dir = join(tmpdir(), `blong-dev-defaults-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    // devrc exists but only configures unrelated keys (e.g. the `db.sql` block)
    writeFileSync(
        join(dir, '.blong_devrc'),
        'db:\n  sql:\n    connection:\n      host: remote.example\n',
    );
    writeFileSync(join(dir, 'package.json'), '{"name": "@scope/blong-access"}');
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const {connection, source, derived} = readConnection(parseArgs(['SELECT 1']));
    t.equal(connection.host, 'localhost', 'defaults host');
    t.equal(connection.port, 3306, 'defaults port');
    t.equal(connection.user, 'blong-admin', 'defaults user');
    t.equal(connection.password, 'password', 'defaults password');
    t.equal(
        connection.database,
        devDbName('blong-access', currentUser()),
        'derived dev DB from package.json suite',
    );
    t.equal(derived, true, 'database marked derived');
    t.match(source, /dev defaults/, 'source flags dev defaults');
    t.end();
});

test('readConnection devrc values override dev defaults, missing fields keep defaults', t => {
    const dir = join(tmpdir(), `blong-dev-defaults-override-${Date.now()}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, '.blong_devrc'),
        'suite: blong-access\nsrv:\n  db:\n    knex:\n      connection:\n        host: devrc.local\n        user: devuser\n',
    );
    const prev = process.cwd();
    process.chdir(dir);
    t.teardown(() => process.chdir(prev));

    const {connection, derived, source} = readConnection(parseArgs(['SELECT 1']));
    t.equal(connection.host, 'devrc.local', 'devrc host wins');
    t.equal(connection.user, 'devuser', 'devrc user wins');
    t.equal(connection.password, 'password', 'missing password falls back to dev default');
    t.equal(connection.port, 3306, 'missing port falls back to dev default');
    t.equal(derived, true, 'database still derived');
    t.notMatch(source, /dev defaults/, 'configured srv.db is not flagged as dev defaults');
    t.end();
});

test('ensureDatabase creates a missing database', async t => {
    const calls: string[] = [];
    const fakeConnect: IConnect = async () => ({
        query: async <T>(sql: string): Promise<[T, unknown]> => {
            calls.push(sql);
            // Missing → no schema row → CREATE issued
            return [sql.startsWith('SELECT') ? [] : [{affectedRows: 1}], undefined] as unknown as [
                T,
                unknown,
            ];
        },
        end: async () => {},
    });
    const {created} = await ensureDatabase({database: 'blong-access-kalin'}, fakeConnect);
    t.equal(created, true, 'created when missing');
    t.ok(
        calls.some(sql => sql.startsWith('CREATE DATABASE')),
        'issued CREATE DATABASE',
    );
    t.end();
});

test('ensureDatabase skips an existing database', async t => {
    const calls: string[] = [];
    const fakeConnect: IConnect = async () => ({
        query: async <T>(sql: string): Promise<[T, unknown]> => {
            calls.push(sql);
            // Existing → schema row returned → no CREATE
            return [
                sql.startsWith('SELECT') ? [{SCHEMA_NAME: 'blong-access-kalin'}] : [],
                undefined,
            ] as unknown as [T, unknown];
        },
        end: async () => {},
    });
    const {created} = await ensureDatabase({database: 'blong-access-kalin'}, fakeConnect);
    t.equal(created, false, 'skipped when present');
    t.notOk(
        calls.some(sql => sql.startsWith('CREATE DATABASE')),
        'no CREATE issued',
    );
    t.end();
});

test('isMultiResult distinguishes single from multi-statement results', t => {
    // Single statement — bare rows array or ResultSetHeader object
    t.equal(isMultiResult([{a: 1}, {a: 2}]), false, 'single SELECT rows are not multi');
    t.equal(isMultiResult([]), false, 'empty single result is not multi');
    t.equal(
        isMultiResult({fieldCount: 0, affectedRows: 1}),
        false,
        'single ResultSetHeader is not multi',
    );
    // Multi statements — array of result sets (rows arrays and/or headers)
    t.equal(isMultiResult([[{a: 1}], [{b: 2}]]), true, 'multi SELECT detected');
    t.equal(isMultiResult([[], [{b: 2}]]), true, 'multi with empty first set detected');
    t.equal(
        isMultiResult([{fieldCount: 0, affectedRows: 1}, [{b: 2}]]),
        true,
        'mixed header + rows detected',
    );
    t.end();
});
