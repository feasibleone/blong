import {orchestrator} from '@feasibleone/blong';

/**
 * Kukum's dispatch orchestrator.
 *
 * `namespace: 'kukum'` registers `ports.kukum.request`, which is what the
 * gateway routes `/rpc/kukum/{primitive}/{predicate}` to. `imports` attaches the
 * `kukum.kukum` handler group (the generated API surface). There is no db
 * destination — kukum operates on the filesystem and the live registry, not on
 * tables.
 *
 * The live `registry` is available to handlers as `this.registry` (exposed on
 * every adapter/orchestrator instance by `AdapterBase`), alongside
 * `this.platform`.
 */
export default orchestrator<Record<string, unknown>>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'kukum',
            imports: [/\.kukum$/],
            logLevel: 'info',
        },
        // `cli` additionally runs this component at 'warn', so the command's
        // stdout carries its result and nothing else.
        cli: {logLevel: 'warn'},
    },
}));
