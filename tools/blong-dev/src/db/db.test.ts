/**
 * Unit tests for `blong-dev db` — the zip writer, the SQL dump and the folder
 * the archive lands in.
 *
 * Nothing here talks to MySQL: the dump takes an injected connection, so the
 * statements are asserted against a fake that answers the four queries the
 * generator makes. The archive is read back with `node:zlib`, which is what
 * proves the hand-written container is a ZIP rather than a buffer that merely
 * starts with the right four bytes.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {test} from 'tap';

import {backupDirectory, backupFileName, stamp} from '../commands/db.ts';
import {createTableStatement, dumpDatabase, insertStatement, type IDumpConnection} from './dump.ts';
import {crc32, createZip, type IZipEntry} from './zip.ts';

/** Read back what `createZip` wrote: one `{name, data}` per local file header. */
function readZip(archive: Buffer): Array<{name: string; data: Buffer}> {
    const entries: Array<{name: string; data: Buffer}> = [];
    let offset = 0;
    while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
        const method = archive.readUInt16LE(offset + 8);
        const size = archive.readUInt32LE(offset + 18);
        const nameLength = archive.readUInt16LE(offset + 26);
        const extraLength = archive.readUInt16LE(offset + 28);
        const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
        const start = offset + 30 + nameLength + extraLength;
        const body = archive.subarray(start, start + size);
        entries.push({
            name,
            data: method === 8 ? inflateRawSync(body) : Buffer.from(body),
        });
        offset = start + size;
    }
    return entries;
}

test('createZip writes a readable archive', async t => {
    const files: IZipEntry[] = [
        {name: 'blong-sport.sql', data: Buffer.from('CREATE TABLE `t` (id int);\n'.repeat(50))},
        {name: 'manifest.json', data: Buffer.from('{"database":"blong-sport"}\n')},
    ];
    const archive = createZip(files, new Date('2026-11-06T13:45:02Z'));
    const read = readZip(archive);
    t.same(
        read.map(entry => entry.name),
        ['blong-sport.sql', 'manifest.json'],
        'both files are in the archive, in order',
    );
    t.same(read[0].data, files[0].data, 'a compressible file round-trips');
    t.same(read[1].data, files[1].data, 'a small file round-trips');
    t.ok(
        archive.subarray(-22).readUInt32LE(0) === 0x06054b50,
        'the end-of-central-directory record closes the archive',
    );
    t.equal(archive.subarray(-22).readUInt16LE(8), 2, 'the record counts both entries');
    t.end();
});

test('createZip stores what does not compress, and refuses a traversing path', async t => {
    // Random bytes deflate larger than they started, so they are stored as-is.
    const incompressible = Buffer.alloc(64);
    for (let index = 0; index < incompressible.length; index++) {
        incompressible[index] = (index * 37 + 11) % 251;
    }
    const archive = createZip([{name: 'blob.bin', data: incompressible}]);
    t.equal(archive.readUInt16LE(8), 0, 'the entry is stored, not deflated');
    t.same(readZip(archive)[0].data, incompressible, 'and round-trips unchanged');
    t.throws(
        () => createZip([{name: '../escape.sql', data: Buffer.from('x')}]),
        /refusing an archive path/,
        'a path that escapes the archive is refused',
    );
    t.end();
});

test('crc32 matches the format definition', async t => {
    t.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'the standard check value');
    t.equal(crc32(Buffer.alloc(0)), 0, 'an empty entry hashes to zero');
    t.end();
});

test('insertStatement quotes identifiers and escapes values', async t => {
    const sql = insertStatement('access role', [
        {roleName: "Admin's role", roleBit: 3, note: null},
        {roleName: 'Manager', roleBit: 4, note: 'x'},
    ]);
    t.match(sql, /^INSERT INTO `access role` \(`roleName`,`roleBit`,`note`\) VALUES$/m);
    t.ok(sql.includes("('Admin\\'s role',3,NULL),"), 'strings are escaped and NULL survives');
    t.ok(sql.includes("('Manager',4,'x');"), 'each row is one tuple');
    t.end();
});

test('createTableStatement drops the auto-increment high-water mark', async t => {
    const ddl =
        'CREATE TABLE `t` (\n  `id` int NOT NULL AUTO_INCREMENT\n) ENGINE=InnoDB AUTO_INCREMENT=42';
    t.equal(
        createTableStatement(ddl),
        'CREATE TABLE `t` (\n  `id` int NOT NULL AUTO_INCREMENT\n) ENGINE=InnoDB',
        'the rows the source happens to hold are not part of the schema',
    );
    t.end();
});

/** A connection answering the four queries the dump makes, over one small table. */
function fakeConnection(rows: Array<Record<string, unknown>>): IDumpConnection {
    return {
        async query<T>(sql: string, params?: unknown[]): Promise<[T, unknown]> {
            if (sql.startsWith('SELECT VERSION'))
                return [[{v: '8.0.42'}] as unknown as T, undefined];
            if (sql.startsWith('SHOW FULL TABLES')) {
                return [
                    [{Tables_in_demo: 'item', Table_type: 'BASE TABLE'}] as unknown as T,
                    undefined,
                ];
            }
            if (sql.startsWith('SHOW CREATE TABLE')) {
                return [
                    [
                        {
                            Table: 'item',
                            'Create Table':
                                'CREATE TABLE `item` (\n  `itemId` int NOT NULL\n) ENGINE=InnoDB AUTO_INCREMENT=7',
                        },
                    ] as unknown as T,
                    undefined,
                ];
            }
            if (sql.startsWith('SELECT *')) {
                const [limit, offset] = params as number[];
                return [rows.slice(offset, offset + limit) as unknown as T, undefined];
            }
            throw new Error(`unexpected query: ${sql}`);
        },
    };
}

test('dumpDatabase writes DDL, rows in batches and the restore switches', async t => {
    const rows = [
        {itemId: 1, name: 'one'},
        {itemId: 2, name: 'two'},
    ];
    const sql = await dumpDatabase(fakeConnection(rows), 'demo', {
        batchSize: 1,
        now: new Date('2026-11-06T13:45:02Z'),
    });
    t.match(sql, /^-- database: demo$/m, 'the header names the database');
    t.match(sql, /^-- dumped: {3}2026-11-06T13:45:02.000Z$/m, 'and the moment');
    t.match(sql, /^-- server: {3}8\.0\.42$/m, 'and the server it came from');
    t.match(sql, /^SET FOREIGN_KEY_CHECKS=0;$/m, 'foreign keys are off for the restore');
    t.match(sql, /^DROP TABLE IF EXISTS `item`;$/m, 'the table is dropped first');
    t.match(sql, /ENGINE=InnoDB;$/m, 'the schema carries no AUTO_INCREMENT counter');
    t.equal(
        sql.match(/^INSERT INTO `item`/gm)?.length,
        2,
        'a batch per read, so a large table is not one buffer',
    );
    t.match(sql, /^SET FOREIGN_KEY_CHECKS=1;$/m, 'and switched back on at the end');
    t.end();
});

test('backupFileName is safe and sorts chronologically', async t => {
    const when = new Date('2026-11-06T13:45:02Z');
    t.equal(stamp(when), '20261106-134502');
    t.equal(backupFileName('blong-sport', when), 'blong-sport-20261106-134502.zip');
    t.equal(backupFileName('blong/sport kalin', when), 'blong_sport_kalin-20261106-134502.zip');
    t.end();
});

test('backupDirectory follows the documented precedence', async t => {
    const root = mkdtempSync(join(tmpdir(), 'blong-dev-db-'));
    try {
        mkdirSync(join(root, 'pkg'), {recursive: true});
        writeFileSync(join(root, 'rush.json'), '{}\n');
        t.same(
            backupDirectory({cli: '/mnt/one', env: '/mnt/two', config: '/mnt/three', cwd: root}),
            {directory: '/mnt/one', source: '--output'},
            '--output wins',
        );
        t.same(
            backupDirectory({env: '/mnt/two', config: '/mnt/three', cwd: root}),
            {directory: '/mnt/two', source: '$BLONG_BACKUP_DIR'},
            'the environment variable is next',
        );
        t.same(
            backupDirectory({config: '/mnt/three', cwd: root}),
            {directory: '/mnt/three', source: '.blong_devrc backup.path'},
            'then the configured path',
        );
        t.same(
            backupDirectory({cwd: join(root, 'pkg')}),
            {
                directory: join(root, 'dev', 'backup'),
                source: 'dev/backup beside rush.json',
            },
            'and the predefined host folder, found from a package directory',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});
