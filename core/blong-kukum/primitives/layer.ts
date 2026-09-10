import {checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `layer` — a named functional group inside a realm. */

const layer: PrimitiveDescriptor = {
    id: 'layer',
    title: 'Layer',
    skill: 'blong-layer',
    summary:
        'A named functional group inside a realm. Well-known folders are auto-discovered; ' +
        'custom folders need a layer.<platform>.ts activation file.',
    kinds: ['server', 'browser', 'custom'],
    defaultKind: 'custom',
    roots: [],
    check(ctx) {
        const problems = checkSubject(ctx.subject);
        if (ctx.kind === 'custom' && !ctx.layer)
            problems.push('layer is required for custom folders');
        return problems;
    },
    files(ctx) {
        const platform = ctx.platform;
        const dir = ctx.layer ?? ctx.params.folder ?? `${ctx.subject}-${ctx.object}`;
        return [
            {
                path: `${dir}/layer.${platform}.ts`,
                content: `import {layer} from '@feasibleone/blong';

export default layer({default: true, integration: true});
`,
            },
        ];
    },
};

export default layer;
