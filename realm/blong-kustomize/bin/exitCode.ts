/**
 * What a command's answer says about the process's exit code.
 *
 * `runCli` prints the result and exits 0 unless the caller says otherwise, and these commands report
 * a failure as a *result* rather than as a throw: the handler catches the cluster's error, describes
 * it, and answers. That is right for the API — a caller reads what happened — and wrong for a shell,
 * where a release that patched nothing and a release that landed are the same green line. A CI job
 * therefore learned nothing from the announcement it exists to make (@@T-838), which is the general
 * shape of @@F-851: a command that reports nothing did not necessarily succeed.
 *
 * So each command says what counts as its own failure, next to the reading of its answer. The rules
 * are deliberately about *the seam that was asked to act*, not about a field name that happens to
 * look like a verdict: `updated: false` is a success when the repository is what owns the tree, and
 * the same value is a failure when this process was the writer.
 */
const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const failures = (value: unknown): number => {
    const list = asRecord(value).failures;
    return Array.isArray(list) ? list.length : 0;
};

/**
 * A release: did the seam it chose write what the caller asked for?
 *
 * - `gitops` — the answer says the tree was pushed, and nothing here was meant to be written. The
 *   repository converges it, so this is the seam succeeding, not a release that did nothing.
 * - `cr` or `operator` — the seam is this process writing, so a `false` verdict with a reason is a
 *   failure, and a pass that applied some objects and failed others is one too: a half-applied
 *   release announced as applied is the account a reader trusts and should not.
 * - `none` — nothing was written and the reason says why (no suite, no version, no adapter).
 */
const releaseExit = (answer: Record<string, unknown>): number => {
    const report = asRecord(answer.report);
    if (report.seam === 'gitops') return 0;
    if (report.updated !== true) return 1;
    return failures(report.pass) ? 1 : 0;
};

/**
 * A pass: converged, and converged everything it planned.
 *
 * `applied: false` is three states, and only one of them is a failure. A draft declaration holds
 * the pass on purpose, and a run without `apply` was asked to report and not to write; both say so
 * in a field, so the exit code does not have to guess from the sentence next to it. What is left
 * when the pass neither wrote nor declared itself idle is a refusal — no cluster adapter, no
 * declaration in scope — and that is precisely the answer a pipeline must not call green.
 */
const passExit = (answer: Record<string, unknown>): number => {
    if (failures(answer)) return 1;
    if (answer.held === true || answer.readOnly === true) return 0;
    return answer.applied === true ? 0 : 1;
};

/**
 * A prune: a namespace with nothing to retire is a success — the retention kept what it had — while
 * a prune whose adapter was not loaded answered with a reason and deleted nothing.
 */
const pruneExit = (answer: Record<string, unknown>): number => (answer.reason ? 1 : 0);

/** The exit code a command's answer asks for, or `undefined` to leave `runCli`'s default alone. */
export const exitCodeFor = (method: string, result: unknown): number | undefined => {
    const answer = asRecord(result);
    switch (method) {
        case 'kustomizeReleaseNotify':
            return releaseExit(answer);
        case 'kustomizeReconcileRun':
            return passExit(answer);
        case 'kustomizeVolumePrune':
            return pruneExit(answer);
        default:
            return undefined;
    }
};
