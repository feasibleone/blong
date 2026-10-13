/**
 * fill.ts — bring a suite artifact to where it is read from, as one program with two callers (the
 * operator's cache and a node's fill Job); nothing here imports but `node:*` (@@D-518).
 */
import {execFileSync} from 'node:child_process';
import {
    closeSync,
    copyFileSync,
    createReadStream,
    createWriteStream,
    existsSync,
    fstatSync,
    mkdirSync,
    openSync,
    readdirSync,
    readlinkSync,
    readSync,
    realpathSync,
    renameSync,
    rmSync,
    statSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, relative} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {createInflateRaw} from 'node:zlib';
/** The settings the fill reads from its environment: the Job's contract, unchanged by this module. */
export const FILL_ENV = {
    root: 'BLONG_ARTIFACT_ROOT',
    identity: 'BLONG_ARTIFACT_IDENTITY',
    keep: 'BLONG_ARTIFACT_KEEP',
    url: 'BLONG_ARTIFACT_URL',
    path: 'BLONG_ARTIFACT_PATH',
} as const;

/**
 * The file that marks an artifact as whole.
 *
 * Our own, not one of the archive's: it is written after the unpack *and* the link step, so its presence
 * is the one thing a reader can trust about the directory.
 */
export const ARTIFACT_READY = '.blong-artifact-ready';

/** Rush's link script, at the root of every artifact, and the reason the link step is its own piece. */
const LINK_SCRIPT = 'create-links.js';

/** A fill, as the two callers ask for one. */
export interface IFillRequest {
    /** The source: a URL to download, or a path to copy. `path` wins when both are given. */
    source: {url?: string; path?: string};
    /** The directory the artifact belongs in. */
    target: string;
    /**
     * Keep the newest `keep` directories under the target's parent, and delete the rest.
     *
     * Omitted by a caller whose neighbours are not its own to remove: the `shared` backend's seed Job
     * fills a claim at its mount point, where other directories belong to whoever mounts the same claim.
     */
    keep?: number;
}

/** The offsets of a zip's central directory, which is where every entry is described. */
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;

/**
 * Where a zip's central directory record starts, found from the end of the bytes given.
 *
 * The caller passes the archive's *tail* rather than the archive, so that finding the record does not mean
 * reading six hundred megabytes to look at the last few bytes of them.
 */
const endOfCentralDirectory = (tail: Buffer): number => {
    for (let at = tail.length - 22; at >= 0; at--) {
        if (tail.readUInt32LE(at) === END_OF_CENTRAL_DIRECTORY) return at;
    }
    throw new Error('the archive has no end of central directory record: it is not a zip');
};

/** The bytes at an offset of an open file, which is how this reader walks an archive it never holds. */
const readAt = (fd: number, offset: number, length: number): Buffer => {
    const bytes = Buffer.alloc(length);
    readSync(fd, bytes, 0, length, offset);
    return bytes;
};

/**
 * Unpack a zip into a directory that is already there — written here and streamed entry by entry,
 * because the fill Job has no `node_modules` above it and runs under a memory limit.
 */
export const unpackZip = async (archive: string, target: string): Promise<void> => {
    const fd = openSync(archive, 'r');
    try {
        const size = fstatSync(fd).size;
        const tailLength = Math.min(size, 22 + 0xffff);
        const end =
            size - tailLength + endOfCentralDirectory(readAt(fd, size - tailLength, tailLength));
        const count = readAt(fd, end + 10, 2).readUInt16LE(0);
        const directorySize = readAt(fd, end + 12, 4).readUInt32LE(0);
        const directoryStart = readAt(fd, end + 16, 4).readUInt32LE(0);
        // The directory is the one part that is read whole, and it holds a few dozen bytes per entry.
        if (
            directorySize === 0xffffffff ||
            directoryStart === 0xffffffff ||
            directoryStart + directorySize > size
        ) {
            throw new Error('the archive is a zip64 one, or says its directory is outside it');
        }
        const directory = readAt(fd, directoryStart, directorySize);
        const where = `${target}/`;
        let cursor = 0;
        for (let index = 0; index < count; index++) {
            if (directory.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
                throw new Error(
                    'the archive says it holds more entries than its central directory does',
                );
            }
            const flags = directory.readUInt16LE(cursor + 8);
            const method = directory.readUInt16LE(cursor + 10);
            const compressedSize = directory.readUInt32LE(cursor + 20);
            const uncompressedSize = directory.readUInt32LE(cursor + 24);
            const nameLength = directory.readUInt16LE(cursor + 28);
            const extraLength = directory.readUInt16LE(cursor + 30);
            const commentLength = directory.readUInt16LE(cursor + 32);
            const local = directory.readUInt32LE(cursor + 42);
            const name = directory.toString('utf8', cursor + 46, cursor + 46 + nameLength);
            cursor += 46 + nameLength + extraLength + commentLength;
            // A directory entry: the files that need it create it on the way in.
            if (name.endsWith('/')) continue;
            if (flags & 0x1)
                throw new Error(`${name} is encrypted, which this reader does not read`);
            if (
                compressedSize === 0xffffffff ||
                uncompressedSize === 0xffffffff ||
                local === 0xffffffff
            ) {
                throw new Error(`${name} is a zip64 entry, which this reader does not read`);
            }
            const written = join(target, name);
            if (!written.startsWith(where)) {
                throw new Error(`${name} would be unpacked outside ${target}`);
            }
            if (method !== 0 && method !== 8) {
                throw new Error(
                    `${name} is compressed with method ${method}, which this reader does not read`,
                );
            }
            mkdirSync(join(written, '..'), {recursive: true});
            if (compressedSize === 0) {
                writeFileSync(written, '');
                continue;
            }
            // The local header repeats the name and its extra field, and the data follows them. A stream's
            // range ends on the last byte rather than one past it.
            const header = readAt(fd, local, 30);
            const from = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
            const packed = createReadStream(archive, {
                start: from,
                end: from + compressedSize - 1,
            });
            if (method === 0) await pipeline(packed, createWriteStream(written));
            else await pipeline(packed, createInflateRaw(), createWriteStream(written));
        }
    } finally {
        closeSync(fd);
    }
};

/**
 * Run Rush's link script over the tree that is at `target` now, if it carries one.
 *
 * The script replaces the `node_modules` a deploy could not archive: a tar or a zip cannot hold symlinks,
 * so `rush deploy` writes the links as a script and something has to run it where the artifact lands.
 * `process.execPath` rather than `node`, because the runtime that started this program is certainly
 * there and one on `PATH` may not be.
 */
export const linkAt = (target: string): void => {
    if (!existsSync(join(target, LINK_SCRIPT))) return;
    execFileSync(process.execPath, [LINK_SCRIPT, 'create'], {cwd: target, stdio: 'inherit'});
};

/**
 * Rewrite every absolute link under `target` as a relative one.
 *
 * The link script computes its targets from the directory it runs in, so a tree linked at
 * `/var/lib/blong/suites/<suite>/<identity>` carries links naming that path — and a reader that mounts the
 * directory anywhere else has hundreds of dangling links and dies on its first import (@@F-449). Every
 * link's target is inside the artifact, which was checked across a whole tree in a live cluster, so a
 * relative link is equivalent and position-independent.
 *
 * A symlinked directory is not descended into — `readdir` reports it as a link, not as a directory —
 * which matters because a link pointing into a `node_modules` tree would otherwise be walked a second
 * time.
 */
export const relativizeLinks = (target: string): number => {
    let rewritten = 0;
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) {
                const pointsAt = readlinkSync(path);
                if (isAbsolute(pointsAt)) {
                    unlinkSync(path);
                    symlinkSync(relative(directory, pointsAt), path);
                    rewritten++;
                }
            } else if (entry.isDirectory()) walk(path);
        }
    };
    walk(target);
    return rewritten;
};

/**
 * Copy a directory's contents into another, which is what a `path` artifact is.
 *
 * Entry by entry rather than in one call, because the artifact's *contents* are wanted at the target and
 * not the artifact directory itself: `cp -R …/. …/` was the shell's spelling of the same thing.
 */
export const copyTree = (source: string, target: string): void => {
    for (const entry of readdirSync(source)) {
        const from = join(source, entry);
        const to = join(target, entry);
        if (statSync(from).isDirectory()) {
            mkdirSync(to, {recursive: true});
            copyTree(from, to);
        } else {
            copyFileSync(from, to);
        }
    }
};

/**
 * Download a URL to a file.
 *
 * `fetch` rather than a request library: it is in the runtime, and a mounted copy of this module could
 * resolve nothing else. Streamed rather than buffered, because a suite artifact is hundreds of megabytes
 * and the fill runs on a node that has one directory's worth of room to spare, not two.
 */
export const download = async (url: string, to: string): Promise<void> => {
    const answer = await fetch(url);
    if (!answer.ok || !answer.body) {
        throw new Error(`the artifact at ${url} answered ${answer.status} ${answer.statusText}`);
    }
    // The body is an async iterator at runtime; the type only carries that through `node:stream/web`,
    // which is a cast this file would rather not depend on.
    const body = answer.body as unknown as AsyncIterable<Uint8Array>;
    await pipeline(Readable.from(body), createWriteStream(to));
};

/**
 * Place an artifact in the directory it will be read from.
 *
 * The marker comes off first and goes on last: it is what says the artifact is whole. A directory is
 * replaced rather than merged, whichever way the artifact arrives, so a rerun cannot keep an older file
 * or leave the link script looking at links it will not create again — which is why the target is emptied
 * rather than written into.
 */
export const fillArtifact = async (request: IFillRequest): Promise<void> => {
    const {source, target} = request;
    rmSync(join(target, ARTIFACT_READY), {force: true});
    rmSync(target, {recursive: true, force: true});
    mkdirSync(target, {recursive: true});
    if (source.path) {
        copyTree(source.path, target);
    } else if (source.url) {
        const archive = join(tmpdir(), `blong-artifact-${process.pid}.zip`);
        try {
            await download(source.url, archive);
            await unpackZip(archive, target);
        } finally {
            rmSync(archive, {force: true});
        }
    } else {
        throw new Error('the artifact names neither a url to fetch nor a path to read');
    }
    linkAt(target);
    relativizeLinks(target);
    writeFileSync(join(target, ARTIFACT_READY), '');
    if (request.keep !== undefined) keepNewest(dirname(target), request.keep);
};

/**
 * Keep the newest directories under `root`, and delete the rest.
 *
 * By modification time rather than by name: an identity is a digest or a stamp, and neither orders — "the
 * last three" is a question the node can answer on its own. The caller passes the count it wants to end up
 * with, and the directory just written is among them, because a fill has only renamed it into place.
 */
export const keepNewest = (root: string, keep: number): void => {
    const directories = readdirSync(root, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => ({name: entry.name, at: statSync(join(root, entry.name)).mtimeMs}))
        .sort((left, right) => right.at - left.at);
    for (const {name} of directories.slice(keep)) {
        rmSync(join(root, name), {recursive: true, force: true});
    }
};

/** Staging directories an interrupted fill left behind, which nothing else would ever collect. */
export const dropStaleStaging = (root: string, olderThanMs = 60 * 60 * 1000): void => {
    const now = Date.now();
    for (const entry of readdirSync(root, {withFileTypes: true})) {
        if (!entry.isDirectory() || !entry.name.startsWith('.staging-')) continue;
        if (now - statSync(join(root, entry.name)).mtimeMs < olderThanMs) continue;
        rmSync(join(root, entry.name), {recursive: true, force: true});
    }
};

/**
 * The fill a node runs, driven by the environment the Job sets.
 *
 * A *staged* fill: the artifact is unpacked, linked and made portable beside where it belongs, and then
 * moved into place in one rename, so a reader sees either nothing or a whole tree — which is what makes an
 * in-place rewrite, and the notification a reader would need to survive one, unnecessary (@@D-468). Linking
 * before the move is what the relative links make possible: a relative link names a path *within* the
 * tree, so a rename that preserves the tree's shape keeps every link valid.
 *
 * A directory that already holds a whole artifact is what this exists to arrive at, so it returns without
 * touching it: the identity *is* the content (@@D-469).
 */
export const fillFromEnvironment = async (): Promise<void> => {
    const env = process.env;
    const root = env[FILL_ENV.root];
    const identity = env[FILL_ENV.identity];
    const keep = env[FILL_ENV.keep];
    // Refused rather than defaulted: a Job that forgot one of these would unpack an artifact into the
    // wrong place, or keep every directory on the node for ever. The shell said the same with `: "${x:?}"`.
    if (!root || !identity || !keep) {
        throw new Error(
            `${FILL_ENV.root}, ${FILL_ENV.identity} and ${FILL_ENV.keep} are all required`,
        );
    }
    const target = join(root, identity);
    if (existsSync(join(target, ARTIFACT_READY))) return;
    const staging = join(root, `.staging-${identity}`);
    rmSync(staging, {recursive: true, force: true});
    mkdirSync(staging, {recursive: true});
    // The retention is how many identities stay on the node, and this run's directory is one of them: the
    // shell spelling passed one more to a helper that kept one fewer, which is the same number written
    // twice (@@D-470).
    await fillArtifact({
        source: env[FILL_ENV.path] ? {path: env[FILL_ENV.path]} : {url: env[FILL_ENV.url] ?? ''},
        target: staging,
        keep: Number(keep),
    });
    // Only ever an *incomplete* directory: a whole one returned above, so this is what an interrupted move
    // or a tree from an earlier revision leaves behind.
    rmSync(target, {recursive: true, force: true});
    renameSync(staging, target);
    dropStaleStaging(root);
};

/**
 * The program half: a fill Job starts this file with `node`, and nothing else does.
 *
 * Matched by *realpath* rather than by comparing URLs, because the copy a Job runs is mounted from a
 * ConfigMap and the kubelet publishes a mount as a symlink to a versioned directory: `node /script/fill.mts`
 * resolves to `.../..2026_10_11_14_46_55.123/ fill.mts`, so `import.meta.url` names that while
 * `process.argv[1]` names the path the Job typed. Comparing the two verbatim therefore never matched, and
 * the module did nothing at all — the fill Job reported `Completed` seconds after it started and published
 * nothing, leaving every reader Pending on a directory that was never created (found in the dev cluster).
 * The realpath comparison runs the fill in both the mounted and the plain case, and still refuses when the
 * module is *imported*: the entry point is then the operator's own.
 */
const startedAsAProgram = (): boolean => {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return realpathSync(entry) === fileURLToPath(import.meta.url);
    } catch {
        // A path that cannot be resolved is not this module: a caller that started something else.
        return false;
    }
};

if (startedAsAProgram()) {
    await fillFromEnvironment();
}
