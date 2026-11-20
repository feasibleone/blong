import {checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `lukaot` — the declared vocabulary: the errors and the log signals a realm reports. */

const lukaot: PrimitiveDescriptor = {
    id: 'lukaot',
    title: 'Declared vocabulary',
    skill: 'blong-handler',
    summary: 'The signals a realm declares: typed errors and log signals, in one vocabulary.',
    kinds: ['layer', 'inline'],
    defaultKind: 'layer',
    roots: ['lukaot'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        const name = ctx.object;
        return [
            {
                path: 'lukaot/error.ts',
                content: `import {declare} from '@feasibleone/lukaot';

/**
 * ${ctx.subject} domain errors.
 *
 * The declared key *is* the name the handler calls, so \`errors.${ctx.subject}${name}NotFound\` in a
 * handler destructure is the same identifier that appears here — there is no second spelling to
 * keep in step. A value that a message interpolates is supplied by the call, and a call that omits
 * it is refused at compile time rather than printed with a hole in it.
 */
export default declare({
    error: {
        ${ctx.subject}${name}NotFound: {
            message: '${name} {${name}Id} not found',
            statusCode: 404,
        },
    },
});
`,
            },
            {
                path: 'lukaot/signal.ts',
                content: `import {declare} from '@feasibleone/lukaot';

/**
 * What ${ctx.subject} reports while it works.
 *
 * A log signal carries the level the policy resolved to and the message a reader sees; the values
 * it interpolates are the ones the call supplies, and a signal that is not declared has no level
 * to raise and no message to render, so the code cannot call one by accident.
 */
export default declare({
    log: {
        ${ctx.subject}${name}Skipped: {
            level: 'warn',
            message: '${name} {${name}Id} was skipped: {reason}',
        },
    },
});
`,
            },
        ];
    },
};

export default lukaot;
