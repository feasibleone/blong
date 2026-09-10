import {
    capitalize,
    checkSubject,
    tripleName,
    type PrimitiveContext,
    type PrimitiveDescriptor,
    type PrimitiveFile,
} from '../engine.ts';
import {appendCommaListValue, readPlainSource} from '../merge.ts';
import {seedRowName} from './shared.ts';

/** `seed` — production and test seed data, including the RBAC grant. */

/**
 * One entity's seed file.
 *
 * `key:` names the identity column; the rows are deliberately stable so a
 * browse screenshot taken against them is reproducible.
 */
function seedSource(ctx: PrimitiveContext): PrimitiveFile {
    const {subject, object} = ctx;
    const kindLabel = ctx.kind === 'test' ? 'Test' : 'Production';
    const dir = ctx.kind === 'test' ? 'meta/dbTest' : 'meta/db';
    return {
        path: `${dir}/${subject}${capitalize(object)}Merge.yaml`,
        content: `# ${kindLabel} seed for ${subject}.${object}.
# The dispatched method is derived from the file name (the '<name>Merge' suffix).
key: ${object}Id
${object}:
  - ${object}Id: 101
    ${object}Name: ${seedRowName(object)}
    ${object}Status: draft
  - ${object}Id: 102
    ${object}Name: Sample ${capitalize(object)} Two
    ${object}Status: sent
`,
    };
}

/**
 * The realm's RBAC test seed.
 *
 * A new entity is unreachable through the gateway until the realm's `Manage`
 * capability lists its actions, so granting them is part of scaffolding the
 * entity rather than an afterthought. The file belongs to the realm template
 * (it dispatches blong-access's shared `access.authorization.merge`), so it is
 * composed into rather than generated.
 */
const RBAC_SEED = 'meta/dbTest/accessAuthorizationMerge.yaml';

const seed: PrimitiveDescriptor = {
    id: 'seed',
    title: 'Seed data',
    skill: 'blong-schema',
    summary:
        'Production seeds (meta/db) and test seeds (meta/dbTest) as <name>Merge.yaml. A test seed ' +
        "also grants the entity's actions to the realm's Manage capability.",
    kinds: ['prod', 'test'],
    defaultKind: 'prod',
    roots: ['meta/db', 'meta/dbTest'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        return [seedSource(ctx)];
    },
    compose({host, root, context}) {
        const files = [seedSource(context)];
        if (context.kind !== 'test') return files;
        const rbac = readPlainSource(host, root, RBAC_SEED);
        if (!rbac) return files;
        const capability = `${context.subject}Manage`;
        const actions = ['add', 'find', 'get', 'edit', 'remove'].map(action =>
            tripleName(context.subject, context.object, action),
        );
        const merged = appendCommaListValue(rbac, capability, actions);
        if (merged === undefined) {
            return [
                {
                    ...files[0],
                    notices: [
                        `${RBAC_SEED} does not declare a '${capability}' capability; add the ` +
                            `${context.object} actions to it by hand or every call will be ` +
                            'denied through the gateway.',
                    ],
                },
            ];
        }
        return [...files, {path: RBAC_SEED, content: merged}];
    },
};

export default seed;
