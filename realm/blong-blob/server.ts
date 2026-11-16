import {realm} from '@feasibleone/blong';

/**
 * server.ts — `blob` realm entry point (server platform).
 *
 * The realm keeps no database: there is no `adapter/db`, no `meta/type` and no `subject` orchestrator,
 * because everything a read needs lives beside the bytes in the backend (@@D-837). The layers
 * `adapter`, `orchestrator`, `gateway`, `error` and `server/test` are auto-discovered.
 *
 * It is a companion (@@D-845): a process that carries it can store and serve blobs in-process, so it
 * owns no process and publishes no Service of its own. The claim it writes to belongs to the realm
 * that declares it. Which processes carry it is the caller's answer rather than the store's — `party`
 * names it in its own `k8sNeeds` and no other realm does, so the store rides that process and the one
 * that carries `party` beside it, and nowhere else (@@D-871).
 */
export default realm(blong => ({
    url: import.meta.url,
    /**
     * The store is chosen by which block a deployment writes, and the other is `false`.
     *
     * A block that is neither — `s3Store: true`, a string, a number — is a deployment mistake that would
     * otherwise surface at the first upload, as a store with no endpoint. The schema refuses it at load and
     * names what it accepts, and a *mistyped key* is refused by the loader's own unknown-key check, so
     * neither mistake can pass quietly (@@D-849).
     */
    validation: blong.type.Object({
        store: blong.type.Optional(
            blong.type.Union([blong.type.Object({}), blong.type.Literal(false)]),
        ),
        s3Store: blong.type.Optional(
            blong.type.Union([blong.type.Object({}), blong.type.Literal(false)]),
        ),
        // The realm declares its own deployment role, so the block it writes it in is part of the shape.
        k8s: blong.type.Optional(
            blong.type.Object({k8sRealmRole: blong.type.Optional(blong.type.String())}),
        ),
    }),
    config: {
        default: {
            // The realm's own defaults are written inside its own block, the way a suite writes them.
            k8s: {k8sRealmRole: 'companion'},
            // The filesystem store is what a process carries unless it says otherwise: the object
            // store costs a bucket and an endpoint, and a process that cannot reach them has storage
            // that refuses every write. A deployment that wants S3 names `blob.s3Store` and sets
            // `blob.store` to `false` — the loader skips a port whose config is `false` (@@D-849).
            s3Store: false as const,
        },
    },
}));
