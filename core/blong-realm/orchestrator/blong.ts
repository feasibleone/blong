import {orchestrator} from '@feasibleone/blong';

/**
 * `blong.*` — the namespace this realm publishes, and where its calls go.
 *
 * A dispatch orchestrator is what owns a namespace: it names it, says which
 * handler groups answer to it, and names the port that carries the calls. The
 * port here is the `semlog` HTTP adapter, because every method under `blong` is
 * a read of the cluster service — there is no business logic to coordinate and
 * no data of this realm's own to keep.
 *
 * This is deliberately *not* the shared subject orchestrator: that one serves
 * `<subject>.<object>.<predicate>` by generating the query for it, so declaring
 * `blong` as a subject turns `blong.flow.find` into `select * from blong_flow` —
 * a table that does not exist, for an entity that does not exist. The namespace
 * belongs to this orchestrator instead, and `destination` is what carries every
 * call under it to the port that does the reading.
 *
 * It deliberately declares **no** `imports`: a handler group attached to two
 * ports is a group whose `this` depends on which attachment the framework
 * reached, and this one must always be the adapter — `this.exec` is how a read
 * leaves, while the orchestrator's own `exec` is the forwarding call. The shared
 * `subject` orchestrator splits the same way: it imports `\.subject$` (its own
 * business logic) and reaches the database through `destination: 'db'`.
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'blong',
            destination: 'semlog',
        },
    },
}));
