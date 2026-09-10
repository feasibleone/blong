import {checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `suite` — the top-level entry point that glues realms together. */

const suite: PrimitiveDescriptor = {
    id: 'suite',
    title: 'Suite',
    skill: 'blong-suite',
    summary: 'Top-level entry point gluing realms together and deciding deployment.',
    kinds: ['default'],
    defaultKind: 'default',
    roots: [],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        const name = ctx.subject;
        return [
            {
                path: 'server.ts',
                content: `import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    children: [
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function ${name}() {
            return import('./index.ts');
        },
    ],
    config: {
        default: {},
        dev: {srv: {}, ${name}: {}},
        integration: {watch: {test: []}},
    },
}));
`,
            },
            {
                path: 'browser.ts',
                content: `import {browser} from '@feasibleone/blong';

export default browser(() => ({
    url: import.meta.url,
    children: [],
    config: {default: {}, integration: {}},
}));
`,
            },
            {
                path: 'package.json',
                content: `{
    "name": "${name}",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "exports": {"./server.ts": "./server.ts"},
    "scripts": {"build": "true", "ci-lint": "blong-dev lint", "ci-test": "blong-dev test"}
}
`,
            },
        ];
    },
};

export default suite;
