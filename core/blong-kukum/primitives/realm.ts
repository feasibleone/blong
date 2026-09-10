import {capitalize, checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `realm` — a business domain boundary, scaffolded from the blong-kopi template. */

const realm: PrimitiveDescriptor = {
    id: 'realm',
    title: 'Realm',
    skill: 'blong-realm',
    summary:
        'Business domain boundary reusing blong-server (no realm-local adapter/db.ts or dispatch ' +
        'orchestrator). Scaffolds the full canonical tree from the blong-kopi template.',
    kinds: ['default'],
    defaultKind: 'default',
    roots: [],
    check(ctx) {
        const problems = checkSubject(ctx.subject);
        // The realm template substitutes `$subject` into identifiers and derives
        // seed method names from `<subject><Object>Merge`, so a multi-word name
        // produces a realm whose seeds dispatch to a non-existent method.
        if (!/^[a-z][a-z0-9]*$/.test(ctx.subject)) {
            problems.push(
                `realm name '${ctx.subject}' must be a single lowercase word — the template ` +
                    'substitutes it into identifiers and derives seed method names from it',
            );
        }
        return problems;
    },
    files(ctx) {
        const name = ctx.subject;
        return [
            {
                path: 'server.ts',
                content: `import {realm} from '@feasibleone/blong';

/**
 * ${name} realm entry point (server platform). Layers are auto-discovered.
 * Reuse blong-server's subject orchestrator + db adapter (REUSE_SERVER).
 */
export default realm(() => ({url: import.meta.url}));
`,
            },
            {
                path: 'browser.ts',
                content: `import {realm} from '@feasibleone/blong';

export default realm(() => ({url: import.meta.url}));
`,
            },
            {
                path: 'orchestrator/subject/init.ts',
                content: `import {handler} from '@feasibleone/blong';

/**
 * The folder name 'subject' stays LITERAL — only the namespace value is the
 * realm's subject.
 */
export default handler(() => ({
    namespace: '${name}',
}));
`,
            },
            {
                path: 'error/error.ts',
                content: `export default {
    '${name}.notFound': '${capitalize(name)} entry {id} not found',
};
`,
            },
        ];
    },
};

export default realm;
