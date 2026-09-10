import {capitalize, checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `gateway` — an explicit gateway validation, or a REST/OpenAPI namespace. */

const gateway: PrimitiveDescriptor = {
    id: 'gateway',
    title: 'Gateway',
    skill: 'blong-rest',
    summary:
        'Explicit gateway validation overriding an auto-generated one, or a REST/OpenAPI namespace.',
    kinds: ['validation', 'openapi'],
    defaultKind: 'validation',
    roots: ['gateway'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        const object = ctx.object;
        if (ctx.kind === 'openapi') {
            return [
                {
                    path: `gateway/api/${object}.ts`,
                    content: `import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {${object}: [new URL('./${object}.yaml', import.meta.url).pathname]},
}));
`,
                },
                {
                    path: `gateway/api/${object}.yaml`,
                    content: `openapi: 3.0.3
info: {title: ${object}, version: 1.0.0}
paths:
    /${object}/check:
        get:
            operationId: check
            responses: {'200': {description: ok}}
`,
                },
            ];
        }
        return [
            {
                path: `gateway/${ctx.subject}/${object}Check.ts`,
                content: `import {validation} from '@feasibleone/blong';

/**
 * Overrides the auto-generated validation for ${ctx.subject}.${object}.check.
 * Registered later than subject.validation, so it WINS for this method.
 */
export default validation(async ({lib: {type}}) => function ${ctx.subject}${capitalize(object)}Check() {
    return {
        params: type.Object({${object}Id: type.stringNotNull()}),
        result: type.Object({ok: type.booleanNotNull()}),
        description: 'Check ${ctx.subject}.${object}',
    };
});
`,
            },
        ];
    },
};

export default gateway;
