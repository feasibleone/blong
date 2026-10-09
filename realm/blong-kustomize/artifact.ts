import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import type {ISuiteArtifact} from './plan.ts';

/**
 * artifact.ts — where a suite's artifact comes from, and where it lands.
 *
 * Two callers share these steps: the operator, which fetches an artifact into its own cache and plans
 * from it, and a node's fill Job, which stages an artifact beside the directory it will occupy and
 * renames it into place. They must agree about where a suite lives and what makes an artifact whole, so
 * the pieces — unpack, link, make portable, mark, retain — are each defined once and differ only in what
 * the caller passes: a literal for the operator, a variable for the fill script.
 *
 * The link script is why none of this is a plain copy: Rush's deploy output carries `create-links.js`
 * instead of symlinks, because an archive cannot hold them, and the links it writes are absolute —
 * computed from the directory the script runs in. Those links are then rewritten as relative ones, which
 * is what makes the artifact readable from wherever a caller places it: a mount path stops being
 * something the artifact has to agree with (D-476).
 */

/**
 * A shell expression: a quoted literal, or a quoted variable.
 *
 * One set of steps serves both callers, which is the point. The operator fetches an artifact into its
 * cache in place, and a node fills a volume by staging beside it and renaming — different operations,
 * but they must agree about what an artifact is and what makes it whole, and two hand-written copies of
 * unpacking, linking and marking would not stay agreed for long. They differ only in what they pass: a
 * literal for the operator, a variable for the fill script, which reads its settings from the
 * environment so that one definition serves every node and every artifact (D-475).
 */
type ShellValue = string;

/** A raw value as a shell literal. */
const literal = (value: string): ShellValue => `"${value}"`;

/** How a variable is written in the script. */
const variable = (name: string): ShellValue => `"$${name}"`;

/** The same variable, unquoted, for the places shell arithmetic reads it as a number. */
const bare = (name: string): string => `$${name}`;

/** The settings the fill script reads from its environment. */
export const FILL_ENV = {
    root: 'BLONG_ARTIFACT_ROOT',
    identity: 'BLONG_ARTIFACT_IDENTITY',
    keep: 'BLONG_ARTIFACT_KEEP',
    url: 'BLONG_ARTIFACT_URL',
    path: 'BLONG_ARTIFACT_PATH',
} as const;

/** Rush's link script, at the root of every artifact, and the reason the link step is its own piece. */
const LINK_SCRIPT = 'create-links.js';

/**
 * Unpack the artifact into a directory that is already there.
 *
 * The *unpack* only. The link step is separate because it is the only part that touches anything outside
 * the tree — it writes symlinks — and because a staged fill links the staging directory before the move
 * rather than the directory readers are about to look at (D-476).
 */
const unpackInto = (
    source: {when: string; path: ShellValue; url: ShellValue},
    target: ShellValue,
): string =>
    `if ${source.when}; then cp -R ${source.path}/. ${target}/\n` +
    `else curl -fsSL ${source.url} -o /tmp/suite.zip\nunzip -oq /tmp/suite.zip -d ${target}\nfi`;

/** Link the tree that is at `target` now, if it carries a link script. */
const linkAt = (target: ShellValue): string =>
    `if [ -f ${target}/${LINK_SCRIPT} ]; then (cd ${target} && node ${LINK_SCRIPT} create); fi`;

/**
 * Rewrite every absolute link under `target` as a relative one.
 *
 * `create-links.js` computes its targets from the directory it runs in, so a tree linked at
 * `/var/lib/blong/suites/<suite>/<identity>` carries links naming that path — and a reader that mounts
 * the directory anywhere else has hundreds of dangling links and dies on its first import (F-449, which
 * needed a second mount of the node root before this). Every link's target is inside the artifact, which
 * was checked across a whole tree in a live cluster, so a relative link is equivalent and
 * position-independent — the artifact stops needing to be readable at the path its links name.
 *
 * One Node process rather than a `find -exec`: there are hundreds of links and a process per link is
 * hundreds of process starts inside the fill. Node rather than `realpath`, because the runtime that ran
 * the link step is certainly there. A symlinked directory is not descended into — `readdir` reports it as
 * a link, not as a directory — which matters because a link pointing into a `node_modules` tree would
 * otherwise be walked a second time.
 */
const relativizeLinks = (target: ShellValue): string =>
    `node -e '` +
    `const fs=require("fs"),path=require("path");` +
    `const root=process.argv[1];let n=0;` +
    `const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){` +
    `const p=path.join(d,e.name);` +
    `if(e.isSymbolicLink()){const t=fs.readlinkSync(p);` +
    `if(path.isAbsolute(t)){fs.unlinkSync(p);fs.symlinkSync(path.relative(d,t),p);n++}}` +
    `else if(e.isDirectory())walk(p)}};` +
    `walk(root);console.log("relative links: "+n)` +
    `' ${target}`;

/**
 * Keep the newest directories under `root`, and delete the rest — one fewer than `count`.
 *
 * By modification time rather than by name: an identity is a digest or a stamp, and neither orders —
 * `ls -t` is what makes "the last three" a question the node can answer on its own. A staged fill has
 * just renamed the newest one into place, so the one in use is never the one that goes.
 */
const keepNewest = (root: ShellValue, count: ShellValue): string =>
    `cd ${root} && ls -1dt */ 2>/dev/null | tail -n +${count} | ` +
    `while read -r gone; do rm -rf "\${gone}"; done`;

/** Staging directories an interrupted fill left behind, which nothing else would ever collect. */
const dropStaleStaging = (root: ShellValue): string =>
    `find ${root} -mindepth 1 -maxdepth 1 -type d -name '.staging-*' -mmin +60 ` +
    `-exec rm -rf {} + 2>/dev/null || true`;

/** Where a staged fill works, relative to the root and the identity it was given. */
const stagingPaths = (
    root: ShellValue,
    identity: ShellValue,
): {target: string; staging: string} => ({
    target: `${root}/${identity}`,
    staging: `${root}/.staging-${identity}`,
});

/**
 * Place the artifact in the directory it will be read from, replacing whatever is there.
 *
 * The marker comes off first and goes on last: it is what says the artifact is whole, and a file
 * *inside* the archive cannot say that — `create-links.js` is unpacked early (it sits at the root, and
 * `unzip` writes in archive order), so a reader that trusted it planned against a tree whose `suite/`
 * directory had not been written yet. That is how a generation died with "No entry point found in
 * /cache/<suite>/<version>" while the unpack was still running (F-407).
 *
 * The directory is replaced rather than merged, whichever way the artifact arrives, so a rerun cannot
 * keep an older file or leave the link script looking at links it will not create again.
 *
 * `keep` prunes the *siblings* of `target` when it is given, which is what keeps the operator's cache
 * bounded: one directory per published artifact is one full unpack, and nothing else would ever remove
 * them (T-286). It is optional because the other caller — the `shared` backend's seed Job — fills the
 * claim at its mount point, where the neighbouring directories are not ours to remove.
 */
export const fetchCommand = (
    artifact: ISuiteArtifact | undefined,
    target: string,
    keep?: number,
): string =>
    [
        'set -eu',
        `mkdir -p "${target}"`,
        `rm -f "${target}/${ARTIFACT_READY}"`,
        `rm -rf "${target}"/*`,
        unpackInto(
            {
                when: artifact?.source === 'path' && artifact.path ? 'true' : 'false',
                path: literal(artifact?.path ?? ''),
                url: literal(artifact?.url ?? ''),
            },
            literal(target),
        ),
        linkAt(literal(target)),
        relativizeLinks(literal(target)),
        `touch "${target}/${ARTIFACT_READY}"`,
        ...(keep ? [keepNewest(literal(dirname(target)), `${keep + 1}`)] : []),
    ].join('\n');

/**
 * The fill a node runs, as a *constant*: the artifact, the identity, the retention and the root all
 * arrive in the environment.
 *
 * This is the script the tree's base carries, in a ConfigMap, and the reason it names variables instead
 * of values: one definition then serves every node and every artifact, so the committed tree stops
 * changing when a deploy does and a node name never appears in it (D-475, D-473). The values live in the
 * Job that mounts this file.
 *
 * A *staged* fill, unlike {@link fetchCommand}: the artifact is unpacked, linked and made portable
 * beside where it belongs, and then moved into place in one rename, so a reader sees either nothing or a
 * whole tree. That is what makes an in-place rewrite — and the notification a reader would need to
 * survive one — unnecessary (D-468). Linking before the move is what the relative links make possible:
 * a relative link is a path *within* the tree, so a rename that preserves the tree's shape keeps every
 * link valid (D-476); an absolute one would have named the staging directory and died with it. The root
 * holds one directory per artifact identity and nothing else, which is also what the retention counts:
 * the count is how many identities stay on the node, and the one this run fills is the newest, so it is
 * never the one that goes (D-470).
 *
 * The move is a rename because the staging directory is a sibling of the target. A container that wrote
 * into a directory on another filesystem would copy, and a copy is visible while it happens — which is
 * the whole thing this shape exists to avoid.
 */
export const fillScript = (): string => {
    const root = variable(FILL_ENV.root);
    const identity = variable(FILL_ENV.identity);
    // The count is read by shell arithmetic, so it is the one variable used unquoted.
    const {target, staging} = stagingPaths(root, identity);
    return [
        'set -eu',
        // Refused rather than defaulted: a Job that forgot one of these would unpack an artifact into
        // the wrong place, or keep every directory on the node for ever.
        `: "\${${FILL_ENV.root}:?a root is required}" ` +
            `"\${${FILL_ENV.identity}:?an identity is required}" ` +
            `"\${${FILL_ENV.keep}:?a count is required}"`,
        `target=${target}`,
        `staging=${staging}`,
        `mkdir -p ${root}`,
        // The identity *is* the content, so a directory that already holds a whole artifact is exactly
        // what this script exists to arrive at: nothing to fetch, and nothing taken from a reader.
        `if [ -f "$target/${ARTIFACT_READY}" ]; then exit 0; fi`,
        `rm -rf "$staging"`,
        `mkdir -p "$staging"`,
        unpackInto(
            {
                when: `[ -n "\${${FILL_ENV.path}:-}" ]`,
                path: variable(FILL_ENV.path),
                url: `${variable(FILL_ENV.url)}`,
            },
            '"$staging"',
        ),
        // Before the move rather than after: the links are relative, so they name a path *inside* the
        // tree and survive the rename into place — which is what lets the move be the one atomic act
        // that publishes the artifact (D-476).
        linkAt('"$staging"'),
        relativizeLinks('"$staging"'),
        // Only ever an *incomplete* directory: a whole one returned above, so this is what an
        // interrupted move or a tree from an earlier revision leaves behind.
        `rm -rf "$target"`,
        `mv "$staging" "$target"`,
        `touch "$target/${ARTIFACT_READY}"`,
        keepNewest(root, `$(( ${bare(FILL_ENV.keep)} + 1 ))`),
        dropStaleStaging(root),
    ].join('\n');
};

/**
 * The file that marks an artifact as whole.
 *
 * Our own, not one of the archive's: it is written by {@link fetchCommand} after the unpack *and* the
 * link step, so its presence is the one thing a reader can trust about the directory.
 */
export const ARTIFACT_READY = '.blong-artifact-ready';

/**
 * The short token one artifact's directories carry: eight characters of its digest, or a digest of the
 * value when the value is not one.
 *
 * A stamp is hashed rather than truncated because a stamp is a timestamp, and a name it appears in has
 * to be short, stable and identical in every process that computes it.
 */
export const artifactToken = (value: string): string =>
    /^[0-9a-f]{8,}$/i.test(value)
        ? value.slice(0, 8).toLowerCase()
        : createHash('sha256').update(value).digest('hex').slice(0, 8);

/**
 * What one deploy's artifact is called, wherever a directory has to tell it from another artifact of the
 * same suite: the version and a token taken from the artifact.
 *
 * Never the version alone. A rebuilt artifact can ship different files under an unchanged version, which
 * is exactly the case a dev cluster hits on every redeploy — and the version alone would name two
 * different trees identically, so the second artifact would be read as if it were the first, or written
 * over the directory a reader is attached to (D-468, D-469). An artifact that names neither a digest nor
 * a stamp falls back to the version, the shape every caller used before the identity existed.
 */
export const artifactIdentity = (version: string, artifact?: ISuiteArtifact): string => {
    const named = artifact?.digest ?? artifact?.deployedAt;
    return named ? `${version}-${artifactToken(named)}` : version;
};

/**
 * Where one artifact is cached: a directory per suite and artifact, so two versions of one suite, two
 * artifacts of one version, and two suites never share one.
 */
export const artifactDir = (
    cacheRoot: string,
    suite: string,
    version: string,
    artifact?: ISuiteArtifact,
): string => join(cacheRoot, suite, artifactIdentity(version, artifact));

/**
 * Whether an artifact is already in place.
 *
 * The marker file rather than anything the archive carries: it is written after the unpack and the
 * link step both finished, while a file from the archive says only that the unpack reached it. A
 * directory that has it has been unpacked, linked and left whole — see {@link ARTIFACT_READY}.
 */
export const artifactReady = (dir: string): boolean => existsSync(join(dir, ARTIFACT_READY));
