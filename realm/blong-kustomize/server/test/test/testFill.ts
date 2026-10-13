import {type IAssert, handler} from '@feasibleone/blong';
import {spawnSync} from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readlinkSync,
    rmSync,
    statSync,
    symlinkSync,
    utimesSync,
    writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {crc32, deflateRawSync} from 'node:zlib';
import {
    ARTIFACT_READY,
    FILL_ENV,
    fillArtifact,
    fillFromEnvironment,
    relativizeLinks,
    unpackZip,
} from '../../../fill.ts';

/**
 * server/test/test/testFill.ts — the step that brings an artifact to where it is read from.
 *
 * `fill.ts` is the realm's own program now rather than shell text, and it is the one file that runs in two
 * places: the operator imports it, and a fill Job runs a mounted copy of it (@@D-518). What that buys is that
 * a mistake here is a *test* failure rather than a fill Job that reports nothing — so the pieces that were
 * previously trusted to `curl`, `unzip`, `find` and `ls` are checked where they can be, by building the
 * archives and the trees they are given.
 *
 * Nothing here touches a cluster or the network: a `path` artifact and a zip this file writes are enough.
 *
 * Registered as the `test.fill` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testFill: ({name = 'fill'}: {name?: string} = {}) =>
        group(name)([
            /**
             * A zip with the entries given, which is what makes the reader testable: `unzip` was a binary,
             * and a binary a test cannot hand a deliberately broken archive to.
             *
             * The layout is the one the zip format specifies and the reader walks: a local header and its
             * data per entry, then a central directory, then an end-of-central-directory record. Entries
             * are deflated unless the test asks for a stored one, so both branches of the reader are
             * exercised. The CRC is computed rather than faked because the reader is entitled to trust it
             * and a wrong one would make a future reader's failure look like this file's fault.
             */
            async function aZipIsUnpackedAsTheArchiveDescribesIt(assert: IAssert) {
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-zip-'));
                try {
                    const archive = join(dir, 'suite.zip');
                    writeFileSync(
                        archive,
                        zipOf([
                            // A directory entry, which a real archive carries and no reader should write as
                            // a file.
                            {name: 'suite/', text: ''},
                            {name: 'suite/index.ts', text: 'export const suite = true;\n'},
                            // Stored rather than deflated, because that is the other branch.
                            {name: 'create-links.js', text: '// linked\n', stored: true},
                            {name: 'suite/nested/deep.txt', text: 'deep\n'},
                        ]),
                    );
                    const target = join(dir, 'unpacked');
                    mkdirSync(target, {recursive: true});
                    await unpackZip(archive, target);
                    assert.equal(
                        readFileSync(join(target, 'suite/index.ts'), 'utf8'),
                        'export const suite = true;\n',
                        'a deflated entry arrives byte for byte',
                    );
                    assert.equal(
                        readFileSync(join(target, 'create-links.js'), 'utf8'),
                        '// linked\n',
                        'and so does a stored one, which the archive did not compress',
                    );
                    assert.ok(
                        statSync(join(target, 'suite')).isDirectory(),
                        'while a directory entry is a directory, not a file named after it',
                    );
                    assert.equal(
                        readFileSync(join(target, 'suite/nested/deep.txt'), 'utf8'),
                        'deep\n',
                        'and a path inside the archive creates the directory it names',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function anEntryThatLeavesTheDirectoryIsRefused(assert: IAssert) {
                // An archive is data from outside this process, and an entry named `../` would write
                // wherever the permissions reach — the one thing a reader of untrusted archives must not do.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-escape-'));
                try {
                    const archive = join(dir, 'escape.zip');
                    writeFileSync(
                        archive,
                        zipOf([
                            {name: 'inside.txt', text: 'inside\n'},
                            {name: '../outside.txt', text: 'outside\n'},
                        ]),
                    );
                    const target = join(dir, 'unpacked');
                    mkdirSync(target, {recursive: true});
                    await assert.rejects(
                        async () => unpackZip(archive, target),
                        /would be unpacked outside/,
                        'an entry that names its way out is refused, and the message names the target',
                    );
                    assert.ok(
                        !existsSync(join(dir, 'outside.txt')),
                        'and nothing was written above the directory it was given',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function anArchiveItCannotReadIsRefused(assert: IAssert) {
                // A zip64 entry puts its sizes in an extra field this reader does not walk, and a file
                // that is not a zip has no central directory at all. Both are refused with a sentence
                // rather than half-unpacked, because a half-unpacked artifact reads as a whole one the
                // moment the marker goes on.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-bad-'));
                try {
                    const target = join(dir, 'unpacked');
                    mkdirSync(target, {recursive: true});
                    const zip64 = join(dir, 'zip64.zip');
                    writeFileSync(zip64, zipOf([{name: 'big.txt', text: 'x', zip64: true}]));
                    await assert.rejects(
                        async () => unpackZip(zip64, target),
                        /zip64 entry/,
                        'a zip64 entry is refused, named as the entry it is',
                    );
                    const notAZip = join(dir, 'not.zip');
                    writeFileSync(notAZip, 'this is not an archive\n');
                    await assert.rejects(
                        async () => unpackZip(notAZip, target),
                        /not a zip/,
                        'and a file with no central directory says so',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function anAbsoluteLinkIsMadeRelative(assert: IAssert) {
                // `create-links.js` computes its targets from the directory it runs in, so a tree linked
                // at one path carries links naming that path — and a reader that mounts the tree anywhere
                // else has hundreds of dangling links and dies on its first import (@@F-449). Making them
                // relative is what lets the artifact be read from wherever it lands (@@D-476).
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-links-'));
                try {
                    mkdirSync(join(dir, 'packages', 'thing'), {recursive: true});
                    writeFileSync(
                        join(dir, 'packages', 'thing', 'index.js'),
                        'module.exports = 1;\n',
                    );
                    mkdirSync(join(dir, 'pkg', 'node_modules'), {recursive: true});
                    const link = join(dir, 'pkg', 'node_modules', 'thing');
                    symlinkSync(join(dir, 'packages', 'thing'), link);
                    const rewritten = relativizeLinks(dir);
                    const pointsAt = readlinkSync(link);
                    assert.deepEqual(
                        {rewritten, absolute: isAbsolute(pointsAt)},
                        {rewritten: 1, absolute: false},
                        'the one absolute link becomes a relative one, and the count says so',
                    );
                    assert.equal(
                        readFileSync(join(link, 'index.js'), 'utf8'),
                        'module.exports = 1;\n',
                        'and it still resolves to the file it named',
                    );
                    assert.equal(
                        relativizeLinks(dir),
                        0,
                        'while a second pass finds nothing left to rewrite',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aFillReplacesTheDirectoryRatherThanMergingIt(assert: IAssert) {
                // The marker comes off first and goes on last, and the directory is emptied rather than
                // written into: a rerun that kept an older file would leave a tree whose links point at
                // what the new artifact no longer has. A `path` artifact is the whole source of this test —
                // a copy, the branch a runbook uses.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-path-'));
                try {
                    const source = join(dir, 'artifact');
                    mkdirSync(join(source, 'suite'), {recursive: true});
                    writeFileSync(
                        join(source, 'suite', 'index.ts'),
                        'export const suite = true;\n',
                    );
                    writeFileSync(join(source, 'create-links.js'), 'console.log("linked");\n');
                    const target = join(dir, 'volume', '1.0.0-abc12345');
                    mkdirSync(target, {recursive: true});
                    writeFileSync(join(target, 'stale.txt'), 'from an earlier revision\n');
                    writeFileSync(join(target, ARTIFACT_READY), '');
                    await fillArtifact({source: {path: source}, target});
                    assert.ok(
                        !existsSync(join(target, 'stale.txt')),
                        'what an earlier fill left is gone, rather than beside the new artifact',
                    );
                    assert.equal(
                        readFileSync(join(target, 'suite/index.ts'), 'utf8'),
                        'export const suite = true;\n',
                        'and the artifact is there, whole',
                    );
                    assert.ok(
                        existsSync(join(target, ARTIFACT_READY)),
                        'with the marker written last, because that is what says it is whole',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aStagedFillPublishesAWholeDirectory(assert: IAssert) {
                // The Job's own path: the artifact is staged beside where it belongs and renamed into
                // place, so a reader sees either nothing or a whole tree (@@D-468) — which is why the
                // retention counts the directories *beside* the target, and why a staging directory an
                // interrupted run left behind is collected rather than counted as an identity.
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-stage-'));
                const saved = [FILL_ENV.root, FILL_ENV.identity, FILL_ENV.keep, FILL_ENV.path].map(
                    key => [key, process.env[key]] as const,
                );
                try {
                    const source = join(dir, 'artifact');
                    mkdirSync(join(source, 'suite'), {recursive: true});
                    writeFileSync(
                        join(source, 'suite', 'index.ts'),
                        'export const suite = true;\n',
                    );
                    const root = join(dir, 'volume');
                    // Three identities already on the node, an hour apart, oldest first: with the count
                    // the fill is given, the newest two stay once this run has added its own.
                    for (const [index, identity] of [
                        '1.0.0-aaaa',
                        '1.0.0-bbbb',
                        '1.0.0-cccc',
                    ].entries()) {
                        const at = join(root, identity);
                        mkdirSync(at, {recursive: true});
                        const when = new Date(Date.now() - (3 - index) * 3_600_000);
                        utimesSync(at, when, when);
                    }
                    // An interrupted fill, and old enough that this run should collect it.
                    const stale = join(root, '.staging-1.0.0-abandoned');
                    mkdirSync(stale, {recursive: true});
                    const longAgo = new Date(Date.now() - 3 * 3_600_000);
                    utimesSync(stale, longAgo, longAgo);
                    process.env[FILL_ENV.root] = root;
                    process.env[FILL_ENV.identity] = '1.0.0-dddd';
                    process.env[FILL_ENV.keep] = '2';
                    process.env[FILL_ENV.path] = source;
                    await fillFromEnvironment();
                    const target = join(root, '1.0.0-dddd');
                    assert.ok(
                        existsSync(join(target, ARTIFACT_READY)) &&
                            readFileSync(join(target, 'suite/index.ts'), 'utf8').includes('suite'),
                        'the fill publishes the artifact where the readers look, marked whole',
                    );
                    assert.deepEqual(
                        ['1.0.0-aaaa', '1.0.0-bbbb', '1.0.0-cccc', '1.0.0-dddd'].filter(identity =>
                            existsSync(join(root, identity)),
                        ),
                        ['1.0.0-cccc', '1.0.0-dddd'],
                        'and the count it was given is how many identities stay, this run among them',
                    );
                    assert.ok(
                        !existsSync(stale),
                        'while the abandoned staging directory is collected',
                    );

                    // A second run of the same identity is the case the marker exists for: the identity
                    // *is* the content, so there is nothing to fetch and nothing taken from a reader.
                    writeFileSync(join(target, 'touched.txt'), '');
                    await fillFromEnvironment();
                    assert.ok(
                        existsSync(join(target, 'touched.txt')),
                        'and filling an identity that is already whole leaves it exactly as it was',
                    );
                } finally {
                    for (const [key, value] of saved) {
                        if (value === undefined) delete process.env[key];
                        else process.env[key] = value;
                    }
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aFillThatCannotMeanItsSettingsIsRefused(assert: IAssert) {
                // The script refused a missing setting with `: "${x:?}"`, and the program has to do the
                // same: a Job that forgot one would unpack an artifact into the wrong place, or keep every
                // directory on the node for ever.
                const saved = [FILL_ENV.root, FILL_ENV.identity, FILL_ENV.keep].map(
                    key => [key, process.env[key]] as const,
                );
                try {
                    for (const [key] of saved) delete process.env[key];
                    await assert.rejects(
                        async () => fillFromEnvironment(),
                        /BLONG_ARTIFACT_ROOT, BLONG_ARTIFACT_IDENTITY and BLONG_ARTIFACT_KEEP/,
                        'a fill with no root, identity or count says which are required',
                    );
                    const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-none-'));
                    try {
                        await assert.rejects(
                            async () => fillArtifact({source: {}, target: join(dir, 'target')}),
                            /neither a url to fetch nor a path to read/,
                            'and an artifact that names no source is refused rather than left empty',
                        );
                    } finally {
                        rmSync(dir, {recursive: true, force: true});
                    }
                } finally {
                    for (const [key, value] of saved) {
                        if (value === undefined) delete process.env[key];
                        else process.env[key] = value;
                    }
                }
            },

            /**
             * The Job's own entry: a copy mounted from a ConfigMap and started with `node`.
             *
             * The kubelet publishes a mount as a symlink to a versioned directory, so the path the Job
             * types (`/script/fill.mts`) is not the one the module is loaded from
             * (`/script/..2026_10_11_14_46_55.123/fill.mts`). Every other case in this file calls
             * `fillFromEnvironment` directly, so all of them stayed green while the Job did nothing at
             * all: the fill Jobs reported `Completed` seconds after they started, published no directory,
             * and every reader waited on one that was never created (found in the dev cluster).
             * This case starts the module the way the Job does — through the symlink — which is the only
             * way a test in this process can see it.
             */
            async function aMountedCopyStartedAsAProgramFillsTheVolume(assert: IAssert) {
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-fill-mount-'));
                try {
                    const source = join(dir, 'artifact');
                    mkdirSync(join(source, 'suite'), {recursive: true});
                    writeFileSync(
                        join(source, 'suite', 'index.ts'),
                        'export const suite = true;\n',
                    );
                    // What the ConfigMap carries: this module's own text, under the name the Job starts.
                    const version = '..2026_10_11_14_46_55.123';
                    const published = join(dir, 'script', version);
                    mkdirSync(published, {recursive: true});
                    writeFileSync(
                        join(published, 'fill.mts'),
                        readFileSync(fileURLToPath(new URL('../../../fill.ts', import.meta.url))),
                    );
                    // And how the kubelet publishes it: the name the Job reads is a link to that directory.
                    const script = join(dir, 'script', 'fill.mts');
                    symlinkSync(join(version, 'fill.mts'), script);

                    const root = join(dir, 'volume');
                    const identity = '1.0.0-mount';
                    const settings = {
                        ...process.env,
                        [FILL_ENV.root]: root,
                        [FILL_ENV.keep]: '1',
                        [FILL_ENV.path]: source,
                    };
                    const started = spawnSync(process.execPath, [script], {
                        env: {...settings, [FILL_ENV.identity]: identity},
                    });
                    assert.equal(
                        started.status,
                        0,
                        'the program started through a symlink exits cleanly, having found itself',
                    );
                    assert.ok(
                        existsSync(join(root, identity, ARTIFACT_READY)) &&
                            readFileSync(join(root, identity, 'suite/index.ts'), 'utf8').includes(
                                'suite',
                            ),
                        'and it publishes the artifact it was told to, which is what a reader waits on',
                    );

                    // The other half of the guard: an import must still fill nothing, or the operator
                    // would fill its own volume every time it planned a suite. Started through a *driver*
                    // rather than with `-e`, so this exercises the path comparison and not the case of a
                    // process that has no entry point at all.
                    const driver = join(dir, 'driver.mts');
                    writeFileSync(driver, "await import('./script/fill.mts');\n");
                    const ignored = '1.0.0-imported';
                    const imported = spawnSync(process.execPath, [driver], {
                        env: {...settings, [FILL_ENV.identity]: ignored},
                    });
                    assert.equal(
                        imported.status,
                        0,
                        'and the same module imports without an error',
                    );
                    assert.ok(
                        !existsSync(join(root, ignored)),
                        'while an import fills nothing at all, which is what being a library means',
                    );
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },
        ]),
}));

/** One entry of the archives this file builds, in the order they are written. */
interface IZipEntry {
    name: string;
    text: string;
    /** Written uncompressed, to exercise the branch that copies rather than inflates. */
    stored?: boolean;
    /** Written with the zip64 marker, which the reader refuses rather than guesses at. */
    zip64?: boolean;
}

/**
 * A zip holding the entries given.
 *
 * The reader in `fill.ts` is written by hand because a mounted module can resolve no dependency, so the
 * archives it has to read are built by hand here too — which is also what makes the entry sizes and the
 * zip64 marker controllable, and a deliberately broken archive possible.
 */
const zipOf = (entries: IZipEntry[]): Buffer => {
    const parts: Buffer[] = [];
    const directory: Buffer[] = [];
    let offset = 0;
    const LOCAL_HEADER = 30;
    const CENTRAL_HEADER = 46;
    const END_OF_CENTRAL_DIRECTORY = 22;
    for (const entry of entries) {
        const content = Buffer.from(entry.text, 'utf8');
        const method = entry.stored ? 0 : 8;
        const packed = entry.stored ? content : deflateRawSync(content);
        const name = Buffer.from(entry.name, 'utf8');
        const local = Buffer.alloc(LOCAL_HEADER);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(crc32(content), 14);
        local.writeUInt32LE(entry.zip64 ? 0xffffffff : packed.length, 18);
        local.writeUInt32LE(entry.zip64 ? 0xffffffff : content.length, 22);
        local.writeUInt16LE(name.length, 26);
        parts.push(local, name, packed);

        const central = Buffer.alloc(CENTRAL_HEADER);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(crc32(content), 16);
        central.writeUInt32LE(entry.zip64 ? 0xffffffff : packed.length, 20);
        central.writeUInt32LE(entry.zip64 ? 0xffffffff : content.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(entry.zip64 ? 0xffffffff : offset, 42);
        directory.push(central, name);
        offset += local.length + name.length + packed.length;
    }
    const index = Buffer.concat(directory);
    const end = Buffer.alloc(END_OF_CENTRAL_DIRECTORY);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(index.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, index, end]);
};
