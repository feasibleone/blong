import {capitalize, checkObject, checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `component` — browser page handlers, action files and portal contributions. */

const component: PrimitiveDescriptor = {
    id: 'component',
    title: 'Browser component',
    skill: 'blong-browser',
    summary: 'A browser page handler, its actions file and its portal menu contribution.',
    kinds: ['component', 'actions', 'portal'],
    defaultKind: 'component',
    roots: ['component'],
    check(ctx) {
        return [...checkSubject(ctx.subject), ...checkObject(ctx.object)];
    },
    files(ctx) {
        const object = ctx.object;
        switch (ctx.kind) {
            case 'actions':
                return [
                    {
                        path: `component/${ctx.subject}.actions.ts`,
                        content: `import type {IAction} from '@feasibleone/blong-browser';

export const ${ctx.subject}${capitalize(object)}Actions: Record<string, IAction> = {};
`,
                    },
                ];
            case 'portal':
                return [
                    {
                        path: `component/${ctx.subject}.portal.ts`,
                        content: `import {handler} from '@feasibleone/blong';

export default handler(({handler: {portalMenuItem}}) => ({
    async '${ctx.subject}.portal.params'() {
        return {menu: [{id: '${ctx.subject}.${object}', label: '${capitalize(object)}'}]};
    },
}));
`,
                    },
                ];
            default:
                return [
                    {
                        path: `component/${ctx.subject}.${object}.component.ts`,
                        content: `import {handler} from '@feasibleone/blong';

export default handler(() => ({
    '${ctx.subject}.${object}.browse': async () => ({
        title: '${capitalize(object)}',
        permission: '${ctx.subject}.${object}.find',
        component: async () => (await import('./${capitalize(object)}.js')).${capitalize(object)},
    }),
}));
`,
                    },
                ];
        }
    },
};

export default component;
