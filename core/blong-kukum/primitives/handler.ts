import {
    capitalize,
    checkNames,
    checkObject,
    checkSubject,
    type PrimitiveDescriptor,
    tripleName,
} from '../engine.ts';
import {checkLayer, STANDARD_PREDICATES} from './checks.ts';
import {groupOf, layerOf} from './shared.ts';

/** `handler` — one function in one file, named with the semantic triple. */

const HANDLER_KINDS = ['api', 'library', 'db', 'super', 'libBindings'];

const handler: PrimitiveDescriptor = {
    id: 'handler',
    title: 'Handler / library function',
    skill: 'blong-handler',
    summary:
        'A single function in a single file, named with the subjectObjectPredicate triple. ' +
        'Kinds: api (gateway), library (shared helper), db (persistence), super (override), libBindings.',
    kinds: HANDLER_KINDS,
    defaultKind: 'api',
    roots: [],
    check(ctx) {
        const problems = [
            ...checkSubject(ctx.subject),
            ...checkObject(ctx.object),
            ...checkNames(String(ctx.params.predicate ?? ''), 'predicate'),
        ];
        if (ctx.params.predicate && !STANDARD_PREDICATES.includes(String(ctx.params.predicate))) {
            problems.push(
                `predicate '${ctx.params.predicate}' is not a standard predicate ` +
                    `(${STANDARD_PREDICATES.slice(0, 6).join('/')}) — reuse one before inventing`,
            );
        }
        if (ctx.kind === 'api') {
            problems.push(...checkLayer(ctx, ['orchestrator', 'gateway', 'adapter']));
        }
        if (ctx.kind === 'db') {
            problems.push(...checkLayer(ctx, ['adapter']));
        }
        return problems;
    },
    files(ctx) {
        const predicate = capitalize(String(ctx.params.predicate ?? 'check'));
        const name = tripleName(ctx.subject, ctx.object, predicate);
        const layer = layerOf(ctx, ctx.kind === 'db' ? 'adapter' : 'orchestrator');
        const group = ctx.kind === 'db' ? 'db' : groupOf(ctx);
        const path = `${layer}/${group}/${name}.ts`;

        switch (ctx.kind) {
            case 'library':
                return [
                    {
                        path,
                        content: `import {library} from '@feasibleone/blong';

export default library(() => function ${name}(input: unknown): unknown {
    return input;
});
`,
                    },
                ];
            case 'libBindings':
                return [
                    {
                        path: `${layer}/${group}/${ctx.subject}Lib.ts`,
                        content: `import {library} from '@feasibleone/blong';

/**
 * Reusable logic for the ${ctx.subject} realm. Attached to the handler proxy as
 * \`lib.${ctx.subject}.*\` for every handler in this group.
 */
export default library(({config}) => ({
    /** Describe what this helper does. */
    ${ctx.subject}Describe(input: unknown): unknown {
        return input;
    },
}));
`,
                    },
                ];
            case 'db':
                return [
                    {
                        path,
                        content: `import {type IMeta, handler} from '@feasibleone/blong/types';
import type {Knex} from 'knex';

type Handler = (params: {${ctx.object}Id: string}) => Promise<unknown>;

/**
 * ${name} — persistence for ${ctx.subject}.${ctx.object}.
 * Reaches the shared pool through the injected query builder (REUSE_SERVER).
 */
export default handler(
    () =>
        async function ${name}(params: Parameters<Handler>[0], $meta: IMeta): ReturnType<Handler> {
            const queryBuilder = this.config?.context?.queryBuilder as Knex;
            const result = await queryBuilder('${ctx.subject}_${ctx.object}').where(params);
            return result;
        },
);
`,
                    },
                ];
            case 'super':
                return [
                    {
                        path,
                        content: `import {handler} from '@feasibleone/blong';

/**
 * ${name} — overrides specific methods of the inherited adapter/orchestrator.
 * Return an object literal of method shorthand; only the listed names are replaced.
 */
export default handler(() => ({
    async ${name}(params: unknown, $meta: unknown): Promise<unknown> {
        return params;
    },
}));
`,
                    },
                ];
            default:
                return [
                    {
                        path,
                        content: `import {type IMeta, handler} from '@feasibleone/blong/types';

// #region API
type Handler = (params: {${ctx.object}Id: string}) => Promise<{ok: boolean}>;
// #endregion

/**
 * ${name} — ${ctx.subject}.${ctx.object} ${predicate.toLowerCase()}.
 */
export default handler(
    () =>
        async function ${name}(params: Parameters<Handler>[0], $meta: IMeta): ReturnType<Handler> {
            return {ok: true};
        },
);
`,
                    },
                ];
        }
    },
};

export default handler;
