import {orchestrator} from '@feasibleone/blong';

/**
 * graphDispatch — the orchestrator that makes the `graph` namespace exist.
 *
 * Without it the realm's handler group is never attached: `server.ts` used to
 * declare a `graphDispatch` config block with nothing to consume it, so
 * `graph.graph.get` existed as a file and as nothing else.
 *
 * `imports` is a suffix match on the group id (`<realm>.graph`), the same shape
 * `blong-server` uses for `.subject` / `.model`. No `db` destination: the graph
 * is read from the live registry, not from storage.
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'graph',
            imports: [/\.graph$/],
            logLevel: 'info',
        },
    },
}));
