import {declare} from '@feasibleone/lukaot';

/**
 * What the `kustomize` realm reports while it renders and reconciles a suite (`@@D-896`).
 *
 * A pass is the realm's only long-running work, and every line here is a fact a person running a
 * cluster needs and cannot recover afterwards: which mode the pass started in, what the listing
 * covered, which resource type matched none of what the cluster holds, and what the pass did. The
 * counts travel as parameters rather than being composed at the call site, so the same record is a
 * sentence in a terminal and a field in a store — and a name can be raised, silenced or counted
 * without the code being touched.
 *
 * The three pairs — pass, watch, tree — are separate names rather than one with a status, because an
 * operator alarm belongs on the failure and not on the success beside it.
 */
export default declare({
    log: {
        /** A reconcile pass says what it was asked to do, before it does it. */
        kustomizeReconcileListing: {
            level: 'info',
            message: 'reconcile: reading from {origin}, apply {apply}, prune {prune}: {managed} managed, {skipped} skipped',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** The tree names no object of these kinds, so the cluster listing is the only source. */
        kustomizeReconcileSwept: {
            level: 'info',
            message: 'reconcile: the tree names none of these, so the listing is all there is (namespace/kind=count): {swept}{unreadable}',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** A kind wants one key and the cluster holds another — the pair says which part disagreed. */
        kustomizeReconcileKeyMismatch: {
            level: 'info',
            message: 'reconcile: {resourceType} wants {wanted} but the cluster has {present} [keys {keys} apiVersion {apiVersion}]',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** A pass reports its own outcome, not only the controller that triggered it. */
        kustomizeReconcilePass: {
            level: 'info',
            message: 'reconcile: pass from {origin}, apply {apply}: {created} to create, {updated} to update, {unchanged} unchanged, {obsolete} obsolete, {deleted} deleted{tally}{failed}',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** The controller reports what the pass it triggered answered. */
        kustomizeControllerPass: {
            level: 'info',
            message: 'controller: pass from {origin}, apply {apply}, prune {prune}{target}: {result}',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** The pass a timer or a watch asked for threw instead of answering. */
        kustomizeControllerPassFailed: {
            level: 'error',
            message: 'controller: pass failed: {error}',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** The loop states the mode it will run in, once, at start. */
        kustomizeControllerStarting: {
            level: 'info',
            message: 'controller: from {origin}, apply {apply}, prune {prune}, resync every {interval}s, watch {watching}',
            mtid: 'event',
            method: 'kustomize.reconcile.run',
        },
        /** The watch trigger answered a change. */
        kustomizeControllerWatch: {
            level: 'info',
            message: 'controller: watch {status}',
            mtid: 'event',
            method: 'kustomize.watch.run',
        },
        /** The watch trigger was rejected — it is not awaited, so this is the only report of it. */
        kustomizeControllerWatchFailed: {
            level: 'error',
            message: 'controller: watch failed: {error}',
            mtid: 'event',
            method: 'kustomize.watch.run',
        },
        /** The operator's own install tree was written. */
        kustomizeTreeInstallGenerated: {
            level: 'info',
            message: 'the operator\'s install tree: wrote {files} file(s) to {outputDir}, namespace {namespace}',
            mtid: 'event',
            method: 'kustomize.tree.generate',
        },
        /** A suite's tree was written. */
        kustomizeTreeSuiteGenerated: {
            level: 'info',
            message: '{suite}: wrote {files} file(s) to {outputDir}, {deployments} deployment(s), {services} service(s), profile {profile}, volume {volume}',
            mtid: 'event',
            method: 'kustomize.tree.generate',
        },
        /** A session has no recorded MLE handshake, so its keys cannot be reached again. */
        identityHandshakeMissing: {
            level: 'warn',
            message: 'no MLE handshake is recorded for {actorId} — the caller has to log in again',
            mtid: 'event',
            method: 'identity.checkInternal',
        },
        /** The cluster refused the token a caller presented. */
        loginTokenReviewRefused: {
            level: 'warn',
            message: 'token review refused ({reason}); presented token is {length} character(s)',
            mtid: 'event',
            method: 'login.token.create',
        },
        /** The token verified but carried no AES keys, so a later call cannot be decrypted. */
        loginTokenHandshakeMissing: {
            level: 'warn',
            message: "token verified for '{username}', but the call carried no MLE handshake (no mlek/mlsk in the JWE header) — later calls cannot be decrypted",
            mtid: 'event',
            method: 'login.token.create',
        },
    },
});
