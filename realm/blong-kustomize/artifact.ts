import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACT_READY } from './fill.ts';
import type { ISuiteArtifact } from './plan.ts';

/**
 * artifact.ts — where a suite's artifact comes from and where it lands, shared by the operator and a
 * node's fill Job; the links are rewritten relative (@@D-476).
 */

/**
 * The fill module, and where a tree mounts it.
 *
 * The container runs this realm's own `fill.ts` — the file the operator imports — so the code inside a fill
 * Job and the code in the operator's process are one program rather than two that have to agree. It used to
 * be shell text: `curl`, `unzip`, `find`, `ls` and `mv` in the framework image, two of which the image
 * installed for nothing else (@@D-518). The name is a constant, so an upgrade patches the object rather than
 * replacing it (@@D-410).
 */
export const FILL_MODULE = {name: 'fill-script', file: 'fill.mts', mountPath: '/script'} as const;

/** The command a container runs to fill: the mounted module, with its settings in the environment. */
export const fillCommand = (...args: string[]): string[] => [
    'node',
    `${FILL_MODULE.mountPath}/${FILL_MODULE.file}`,
    ...args,
];

/** The volume a Job carries so the module is there, and the mount that puts it at its path. */
export const fillModuleVolume = (): Record<string, unknown> => ({
    name: FILL_MODULE.name,
    configMap: {name: FILL_MODULE.name},
});

export const fillModuleMount = (): Record<string, unknown> => ({
    name: FILL_MODULE.name,
    mountPath: FILL_MODULE.mountPath,
    readOnly: true,
});

/**
 * The module's bytes, as the ConfigMap carries them: base64, one keyed value per file.
 *
 * The bytes are `fill.min.mts`, the module swc wrote, rather than `fill.ts`: the copy that runs in a
 * Job is a derived artefact, and minifying it inline would put a minifier into the framework image and
 * the operator's artifact, neither of which carries one (@@D-542). `npm run sync-fill-module` writes
 * it, and a test compares the committed copy with a fresh one, so a stale file fails there (@@D-543).
 *
 * `binaryData` rather than `data`, because a multi-line value is written as a *folded* block scalar — the
 * line breaks would be replaced with spaces and the text re-wrapped at the width, and a program that
 * arrived that way would not parse. kustomize re-emits the value it parsed, so the flattening would
 * survive into the cluster. Base64 is one line, which no style can fold, and the kubelet decodes it back
 * into a file of exactly the bytes the realm wrote (@@D-518). The object itself is the generator's, so that
 * it carries the labels every other object of a tree carries.
 */
export const fillModuleData = (): Record<string, string> => ({
    [FILL_MODULE.file]: readFileSync(new URL('./fill.min.mts', import.meta.url)).toString('base64'),
});

/**
 * The fill itself, re-exported from the module that does the work.
 *
 * The settings and the marker live in `fill.ts` now, and both names stay reachable from here because the
 * tree and the operator both ask this module for them — and because the mounted copy is that same file
 * (@@D-518).
 */
export { ARTIFACT_READY, FILL_ENV, fillArtifact, keepNewest, type IFillRequest } from './fill.ts';

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
 * over the directory a reader is attached to (@@D-468 @@D-469). An artifact that names neither a digest nor
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
