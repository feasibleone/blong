import {capitalize, checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `error` — the domain error layer. */

const error: PrimitiveDescriptor = {
    id: 'error',
    title: 'Typed errors',
    skill: 'blong-error',
    summary: 'Domain error layer: parameterised messages, HTTP status codes, wrapping.',
    kinds: ['layer', 'inline', 'librarySet'],
    defaultKind: 'layer',
    roots: ['error'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        const name = ctx.object;
        return [
            {
                path: 'error/error.ts',
                content: `/**
 * ${ctx.subject} domain errors.
 * Keys are '<subject>.<entity>.<reason>' so they can be referenced as
 * errors.${ctx.subject}${capitalize(name)}NotFound etc.
 */
export default {
    '${name}.notFound': '${capitalize(name)} {${name}Id} not found',
    '${name}.invalid': {message: '${capitalize(name)} is invalid', statusCode: 400},
};
`,
            },
        ];
    },
};

export default error;
