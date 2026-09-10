import {realm} from '@feasibleone/blong';

/**
 * blong-graph realm entry point.
 *
 * `orchestrator/graph.ts` declares the `graph` namespace and attaches the
 * `orchestrator/graph/` handler group. The previous `children: ['./adapter',
 * './gateway']` pointed at directories with no `server.ts`, so both children
 * silently did nothing and no handler was ever attached; the `graphDispatch`
 * config block had no orchestrator to consume it either.
 */
export default realm(() => ({
    url: import.meta.url,
}));
