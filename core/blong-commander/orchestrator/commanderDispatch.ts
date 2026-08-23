import {orchestrator} from '@feasibleone/blong';

/**
 * commanderDispatch — orchestrator namespace exposing the generic commander
 * protocol: `commander.source.list` / `commander.branch.list` /
 * `commander.node.get` / `commander.node.viewer` / `commander.node.action`.
 *
 * The source descriptors are read from the `commander.sources` config slice.
 */
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.String(),
        imports: blong.type.Array(blong.type.String()),
    }),
    activation: {
        default: {
            namespace: 'commander',
            imports: ['commander.commander'],
        },
    },
}));
