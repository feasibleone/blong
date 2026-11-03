import {handler, type IMeta} from '@feasibleone/blong';
import {
    OPERATOR_GROUP,
    OPERATOR_NAME,
    OPERATOR_NAMESPACE,
    OPERATOR_PLURAL,
    OPERATOR_VERSION,
} from '../../operator.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;
type GitopsCall = (params: {target?: string}, $meta?: IMeta) => {pushed: boolean; reason?: string};

export interface IReleaseNotify {
    /** The suite, which is the CR's own name — the operator reads it off the object (Q4). */
    suite: string;
    /** The version the release published. */
    version: string;
    /** Where the artifact came from, when the release published a new one. */
    artifactUrl?: string;
    /** The artifact's sha256, when the release published one; it names the volume (@@D-469). */
    artifactDigest?: string;
    /** The framework image tag, when the release moved it. */
    frameworkImage?: string;
    /** The framework version the release was built against; becomes `minFrameworkVersion`. */
    frameworkVersion?: string;
    /** The tenant namespace; the realm's own config answers when it is omitted. */
    namespace?: string;
}

/**
 * kustomize.release.notify — a release patches the CR the operator converges from, or pushes a tree
 * for a GitOps seam (@@D-379).
 */
export const releasePatch = (
    params: Pick<
        IReleaseNotify,
        'version' | 'frameworkImage' | 'frameworkVersion' | 'artifactUrl' | 'artifactDigest'
    >,
): Array<{op: string; path: string; value: unknown}> => {
    // A list of operations rather than an object, for the reason `kustomize.status.edit` documents at
    // length: the client sends `application/json-patch+json` for a custom resource, and `add` replaces
    // a member that is already there, so one operation covers the first release and every one after it.
    //
    // Every path is a *member*, and the artifact's is the one that matters: `add` on
    // `/spec/suiteVolume` replaces the whole volume, so a release that meant to move the artifact also
    // reset `backend` and `retention` to whatever the CRD declares as a default — a node-local suite
    // became `auto` because a release happened, with nothing in the answer saying so. Written out and
    // exported because that is the kind of mistake a test can hold down and a reading cannot.
    const body: Array<{op: string; path: string; value: unknown}> = [
        {op: 'add', path: '/spec/version', value: params.version},
    ];
    if (params.frameworkImage !== undefined) {
        body.push({op: 'add', path: '/spec/frameworkImage', value: params.frameworkImage});
    }
    if (params.frameworkVersion !== undefined) {
        body.push({
            op: 'add',
            path: '/spec/minFrameworkVersion',
            value: params.frameworkVersion,
        });
    }
    if (params.artifactUrl !== undefined) {
        body.push({
            op: 'add',
            path: '/spec/suiteVolume/artifact',
            // The digest is what names the volume and the attempt; a release that knows it hands it
            // on rather than leaving the operator to fall back to the version (@@D-469).
            value: {
                source: 'url',
                url: params.artifactUrl,
                ...(params.artifactDigest !== undefined ? {digest: params.artifactDigest} : {}),
            },
        });
    }
    return body;
};

/**
 * Which seam answered a release: the repository, a declaration, the operator's own pass, or none.
 */
export type ReleaseSeam = 'gitops' | 'cr' | 'operator' | 'none';

/** The counts one operator pass reports, as much of them as a summary needs (@@D-750). */
export interface IReleasePass {
    created?: number;
    updated?: number;
    unchanged?: number;
    obsolete?: number;
    deleted?: number;
    /** How many objects the pass left to the install rather than applying (see `apply.ts`). */
    skipped?: number;
    failures?: Array<{key: string; message: string}>;
    reason?: string;
}

/**
 * What one seam did with a release, in the words a reader needs (@@D-751).
 *
 * The handler builds this once and renders it once: the answer carries the facts and the markdown,
 * so the workflow summary and a chat channel post the same account of the same release rather than
 * two descriptions that drift.
 */
export interface IReleaseReport {
    /** The suite the release moved: a CR's own name, or `blong-operator` for the operator itself. */
    suite: string;
    /** The version it moved to. */
    version: string;
    /** The version the declaration held before, when the seam could read it. */
    previousVersion?: string;
    /** The namespace the write landed in; absent when nothing was written. */
    namespace?: string;
    /** Which seam answered (@@D-379 @@D-750). */
    seam: ReleaseSeam;
    /** Whether the seam changed anything. */
    updated: boolean;
    /**
     * The fields the release moved, in the order the seam applied them.
     *
     * A field is named as a reader says it (`Artifact`) and its value is already markdown — the
     * document is the only rendering, so a value that needs backticks carries them.
     */
    changed: Array<{field: string; value: string}>;
    /** The pass an operator release ran, when the seam was the operator's own. */
    pass?: IReleasePass;
    /** Why the seam did nothing, when it did nothing. */
    reason?: string;
}

/** What each seam is, in a phrase a reader of a summary can act on. */
const SEAM_TEXT: Record<ReleaseSeam, string> = {
    gitops: 'the tree was pushed to the gitops target, which is what converges it',
    cr: 'the `BlongDeployment` was patched, and the operator converges it',
    operator: "the operator's own pass — this process applied the tree it runs under",
    none: 'nothing was written',
};

/** The last path segment of an artifact URL, which is the name a reader recognises it by. */
const artifactName = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
        const {pathname} = new URL(url);
        const name = pathname.split('/').filter(Boolean).pop();
        return name || undefined;
    } catch {
        // Not a URL: a `path`-sourced artifact names a directory on the node, and quoting it whole is
        // better than losing it to a parse that failed.
        return undefined;
    }
};

/** The artifact as one value: the file a reader knows, and the digest that names its volume. */
const artifactValue = (url: string | undefined, digest: string | undefined): string | undefined => {
    if (!url && !digest) return undefined;
    const name = artifactName(url);
    const parts = [name ? `\`${name}\`` : url ? `\`${url}\`` : undefined];
    if (digest) parts.push(`\`sha256:${digest.slice(0, 12)}…\``);
    return parts.filter(Boolean).join(' at ');
};

/** A count of a pass, phrased so a zero still says what did not have to happen. */
const passValue = (pass: IReleasePass): string => {
    const counts = [
        `${pass.created ?? 0} created`,
        `${pass.updated ?? 0} updated`,
        `${pass.unchanged ?? 0} unchanged`,
        `${pass.obsolete ?? 0} obsolete`,
        `${pass.deleted ?? 0} deleted`,
    ];
    const skipped = pass.skipped ? `${pass.skipped} install-owned left to the install` : undefined;
    const failures = pass.failures?.length ? `${pass.failures.length} failed` : undefined;
    return [...counts, skipped, failures].filter(Boolean).join(', ');
};

/**
 * The summary of one release, as markdown (@@D-751).
 *
 * A bullet list rather than a table, and every value backticked: the document is written once and
 * read twice — a workflow job summary, which renders tables, and a chat channel, which does not —
 * and a version must not be able to read as prose in either. Exported and pure, so the wording is a
 * thing a test holds down rather than something only a release can show.
 */
export const releaseMarkdown = (report: IReleaseReport): string => {
    const moved =
        report.previousVersion && report.previousVersion !== report.version
            ? `\`${report.previousVersion}\` → \`${report.version}\``
            : `\`${report.version}\``;
    const lines = [
        `### Release deploy — \`${report.suite}\` ${moved}`,
        '',
        `- **Suite:** \`${report.suite}\`` +
            (report.namespace ? ` in namespace \`${report.namespace}\`` : ''),
        `- **Seam:** ${SEAM_TEXT[report.seam]}`,
        // The verdict first of everything the seam reported about itself, because a reader scanning
        // two of these wants to know which one needs them.
        `- **Result:** ${report.updated ? 'applied' : 'not applied'}`,
        ...report.changed.map(({field, value}) => `- **${field}:** ${value}`),
    ];
    if (report.pass) lines.push(`- **Pass:** ${passValue(report.pass)}`);
    for (const failure of report.pass?.failures ?? []) {
        lines.push(`- **Failed:** \`${failure.key}\` — ${failure.message}`);
    }
    const reason = report.reason ?? report.pass?.reason;
    if (reason) lines.push(`- **${report.updated ? 'Note' : 'Why'}:** ${reason}`);
    return lines.join('\n');
};

export default handler(({handler}) => {
    const call = <T>(name: string): T | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function' ? (candidate as T) : undefined;
    };

    /**
     * The version a declaration held before this release, when the cluster can be asked.
     *
     * Best-effort by design: the report describes what happened, so a read that fails turns a
     * `from → to` into a plain `to` rather than failing a release that is already being applied.
     */
    const previousVersion = async (
        name: string,
        namespace: string,
        $meta: IMeta | undefined,
    ): Promise<string | undefined> => {
        const find = call<
            (
                params: object,
                $meta: IMeta,
            ) => Promise<{
                items?: Array<{metadata?: {name?: string}; spec?: {version?: string}}>;
            }>
        >('clusterCustomFind');
        if (!find) return undefined;
        try {
            const found = await find(
                {
                    group: OPERATOR_GROUP,
                    version: OPERATOR_VERSION,
                    plural: OPERATOR_PLURAL,
                    namespace,
                },
                $meta as IMeta,
            );
            return found?.items?.find(item => item.metadata?.name === name)?.spec?.version;
        } catch {
            return undefined;
        }
    };

    return {
        async kustomizeReleaseNotify(
            params: IReleaseNotify,
            $meta?: IMeta,
        ): Promise<{
            updated: boolean;
            gitops: {pushed: boolean; reason?: string};
            reason?: string;
            /** What the seam did, with the fields and counts behind the verdict (@@D-751). */
            report: IReleaseReport;
            /** The same facts as one markdown document, for a job summary or a chat channel. */
            markdown: string;
            /** The pass an operator release was answered by (@@D-750); absent for a tenant's. */
            pass?: unknown;
        }> {
            const gitops = call<GitopsCall>('kustomizeGitopsPush');
            // Consulted first, because it decides whether the CR is the right place to write at all:
            // with a gitops target there is an operator converging from the repository, and a patch
            // here would be a second one converging from the cluster.
            const pushed = gitops?.({}, $meta) ?? {
                pushed: false,
                reason: 'the gitops seam is not loaded',
            };
            /**
             * One answer shape for every seam.
             *
             * The verdict (`updated`, `gitops`, `reason`) stays where a caller already reads it, and
             * the report and its markdown are added beside it: a release is described once and the
             * description travels, rather than each reader assembling its own from the verdict.
             */
            const answer = (report: IReleaseReport, extra: Record<string, unknown> = {}) => ({
                updated: report.updated,
                gitops: pushed,
                ...(report.reason ? {reason: report.reason} : {}),
                report,
                markdown: releaseMarkdown(report),
                ...extra,
            });
            /**
             * The fields a release moved, as a summary states them.
             *
             * The version is not one of them: it is in the title, as `from → to` whenever the old
             * value is known, and repeating it in the list says nothing a reader does not see first.
             */
            const moved = (): IReleaseReport['changed'] => {
                const fields: IReleaseReport['changed'] = [];
                const artifact = artifactValue(params.artifactUrl, params.artifactDigest);
                if (artifact) fields.push({field: 'Artifact', value: artifact});
                if (params.frameworkImage || params.frameworkVersion) {
                    fields.push({
                        field: 'Framework',
                        value:
                            `\`${params.frameworkImage ?? 'the configured image'}\`` +
                            (params.frameworkVersion ? ` at \`${params.frameworkVersion}\`` : ''),
                    });
                }
                return fields;
            };
            const base = (seam: ReleaseSeam, updated: boolean, reason?: string) => ({
                suite: params?.suite ?? '',
                version: params?.version ?? '',
                seam,
                updated,
                changed: updated ? moved() : [],
                ...(reason ? {reason} : {}),
            });

            if (pushed.pushed) {
                // The repository owns the tree in this mode, so nothing was written here — but the
                // release did move something, and the summary says what it moved.
                return answer({
                    ...base('gitops', false),
                    changed: moved(),
                    ...(pushed.reason ? {reason: pushed.reason} : {}),
                });
            }

            const patch = call<ClusterCall>('clusterCustomPatch');
            if (!patch) {
                return answer(base('none', false, 'the cluster adapter is not loaded'));
            }
            if (!params?.suite) {
                return answer(base('none', false, 'no suite named'));
            }
            if (!params.version) {
                return answer(base('none', false, 'no version to announce'));
            }

            /**
             * The operator's own release, which has no CR to patch (@@D-750).
             *
             * The tree the operator runs under is not a `BlongDeployment`: one process per cluster,
             * installed once, and its install tree is the plan the process itself holds. So the
             * announcement becomes the pass that tree would be written by — a registry pass with the
             * release's facts laid over the plan — and the pass applies the fill Jobs for the new
             * artifact and then the Deployment that runs this process, which is the only writer that
             * could put a new artifact in front of itself.
             */
            if (params.suite === OPERATOR_NAME) {
                const reconcile = call<
                    (
                        params: object,
                        $meta: IMeta,
                    ) => Promise<{
                        applied?: boolean;
                        reason?: string;
                        created?: number;
                        updated?: number;
                        unchanged?: number;
                        obsolete?: number;
                        deleted?: number;
                        skipped?: string[];
                        failures?: Array<{key: string; message: string}>;
                    }>
                >('kustomizeReconcileRun');
                if (!reconcile) {
                    return answer(base('none', false, 'the reconcile pass is not loaded'));
                }
                const pass = await reconcile(
                    {
                        from: 'registry',
                        apply: true,
                        prune: true,
                        release: {
                            version: params.version,
                            ...(params.artifactUrl ? {artifactUrl: params.artifactUrl} : {}),
                            ...(params.artifactDigest
                                ? {artifactDigest: params.artifactDigest}
                                : {}),
                            ...(params.frameworkImage
                                ? {frameworkImage: params.frameworkImage}
                                : {}),
                            ...(params.frameworkVersion
                                ? {frameworkVersion: params.frameworkVersion}
                                : {}),
                        },
                    },
                    $meta as IMeta,
                );
                return answer(
                    {
                        ...base('operator', pass.applied === true),
                        namespace: OPERATOR_NAMESPACE,
                        pass: {
                            created: pass.created,
                            updated: pass.updated,
                            unchanged: pass.unchanged,
                            obsolete: pass.obsolete,
                            deleted: pass.deleted,
                            skipped: pass.skipped?.length,
                            failures: pass.failures,
                            ...(pass.reason ? {reason: pass.reason} : {}),
                        },
                    },
                    {pass},
                );
            }
            const namespace =
                params.namespace ??
                (this as unknown as {config?: {namespace?: string}}).config?.namespace;
            if (!namespace) {
                return answer(base('none', false, 'no namespace to write into'));
            }

            const body = releasePatch(params);
            // Read *before* the patch, or the answer would name the version it just wrote as the one
            // it came from.
            const before = await previousVersion(params.suite, namespace, $meta);
            try {
                await patch(
                    {
                        group: OPERATOR_GROUP,
                        version: OPERATOR_VERSION,
                        plural: OPERATOR_PLURAL,
                        namespace,
                        name: params.suite,
                        body,
                    },
                    $meta as IMeta,
                );
                return answer({
                    ...base('cr', true),
                    namespace,
                    ...(before ? {previousVersion: before} : {}),
                });
            } catch (error) {
                return answer(
                    base('cr', false, error instanceof Error ? error.message : String(error)),
                );
            }
        },
    };
});
