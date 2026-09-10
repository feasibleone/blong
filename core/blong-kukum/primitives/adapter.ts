import {checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `adapter` — the integration point with an external system. */

const adapter: PrimitiveDescriptor = {
    id: 'adapter',
    title: 'Adapter',
    skill: 'blong-adapter',
    summary: 'Integration point with an external system (HTTP, TCP, SQL, webhook, …).',
    kinds: ['http', 'tcp', 'knex', 'webhook', 'mongodb', 'k8s', 's3', 'mock', 'base'],
    defaultKind: 'http',
    roots: ['adapter'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        const name = ctx.object;
        const kind = ctx.kind;
        return [
            {
                path: `adapter/${name}.ts`,
                content: `import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.${kind}',
    validation: blong.type.Object({config: blong.type.Any()}),
    activation: {
        default: {namespace: '${ctx.subject}', imports: [/\\.${name}$/]},
        ${ctx.platform}: {},
    },
}));
`,
            },
        ];
    },
};

export default adapter;
