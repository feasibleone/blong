import { realm } from '@feasibleone/blong';
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        adapter: blong.type.Boolean(),
        gateway: blong.type.Boolean(),
    }),
    children: ['./adapter', './gateway'],
    config: {
        default: {
            adapter: true,
            gateway: true,
            graphDispatch: {
                namespace: 'graph',
                imports: 'graph.graph',
            },
        },
    },
}));
//# sourceMappingURL=server.js.map