import {checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `orchestrator` — the business-logic coordinator of a namespace. */

const orchestrator: PrimitiveDescriptor = {
    id: 'orchestrator',
    title: 'Orchestrator',
    skill: 'blong-orchestrator',
    summary:
        'Business-logic coordinator. Dispatch orchestrators own a namespace; init files declare ' +
        'the realm namespace; schedule orchestrators run cron handlers.',
    kinds: ['dispatch', 'init', 'schedule'],
    defaultKind: 'dispatch',
    roots: ['orchestrator'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        const name = ctx.object;
        switch (ctx.kind) {
            case 'init':
                return [
                    {
                        path: `orchestrator/${ctx.subject}/init.ts`,
                        content: `import {handler} from '@feasibleone/blong';

/**
 * Declares the '<realm>' namespace handled by this realm's dispatch orchestrator.
 * The folder name '${ctx.subject}' stays LITERAL — do NOT replace it.
 */
export default handler(() => ({
    namespace: '${ctx.subject}',
}));
`,
                    },
                ];
            case 'schedule':
                return [
                    {
                        path: `orchestrator/${name}.ts`,
                        content: `import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.schedule',
    activation: {
        default: {
            namespace: '${ctx.subject}',
            imports: [/\\.${name}$/],
            schedule: {${name}Run: '0 2 * * *'},
        },
    },
}));
`,
                    },
                ];
            default:
                return [
                    {
                        path: `orchestrator/${name}.ts`,
                        content: `import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: '${ctx.subject}',
            imports: [/\\.${name}$/],
            logLevel: 'info',
        },
    },
}));
`,
                    },
                ];
        }
    },
};

export default orchestrator;
