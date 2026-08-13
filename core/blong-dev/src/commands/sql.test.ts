/**
 * Unit tests for the `blong-dev sql` command helpers (commands/sql.ts).
 *
 * The DB-connection/query execution path needs a live MySQL backend (covered by
 * CI/manual runs); these tests cover the pure helpers: `.blong_devrc` parsing,
 * dot-path lookup, and connection resolution with CLI overrides.
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {parseArgs} from './log.ts';
import {getPath, parseDevRc, readConnection} from './sql.ts';

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
