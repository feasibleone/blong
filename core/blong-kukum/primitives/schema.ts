import {
    checkSubject,
    type PrimitiveContext,
    type PrimitiveDescriptor,
    type PrimitiveFile,
} from '../engine.ts';
import {insertMapEntry} from '../merge.ts';
import {readGenerated} from './compose.ts';

/** `schema` — declarative tables, their registration order, and procedures. */

/** The TypeBox table factory for one entity. */
function schemaTableSource(subject: string, object: string): string {
    return `import {schema} from '@feasibleone/blong';

/**
 * ${subject}.${object} table.
 *
 * Every file under meta/type/ contributes to schema[${subject}], so this file can
 * sit alongside schema.ts without displacing the tables declared there.
 *
 * Constraint shapes are objects keyed by column (\`unique: {name: {}}\`), not
 * arrays — the array form silently produces an index over a column named '0'.
 */
export default schema(async ({lib: {type}}) => ({
    ${object}: type.Object(
        {
            ${object}Id: type.increment(),
            ${object}Name: type.stringNotNull({maxLength: 50}),
            ${object}Status: type.stringNotNull({maxLength: 20}),
            createdAt: type.dateTimeNull(),
        },
        {
            constraints: {
                unique: {
                    ${object}Name: {},
                },
            },
        },
    ),
}));
`;
}

/** The table registry (`meta/db/db.ts`) — creation order for the whole realm. */
function schemaRegisterSource(subject: string, object: string): string {
    return `import {handler} from '@feasibleone/blong';

const _schemaDir = new URL('./schema/', import.meta.url).pathname;

export default handler(() => ({
    config: {
        schema: {
            // Creation order: a table must come after the ones it references.
            tables: {'${subject}.${object}': 2},
            procedurePaths: [_schemaDir],
        },
    },
}));
`;
}

/** A stored-procedure skeleton for one entity. */
function schemaProcedureSource(subject: string, object: string): string {
    return `-- ${subject}.${object} helper procedure.
-- Drop the leading underscore from the filename to also bind it as an API method.
CREATE PROCEDURE ${subject}_${object}Refresh()
BEGIN
    SELECT 1;
END;
`;
}

/** The files a `schema` kind produces against an empty target. */
function schemaFiles(ctx: PrimitiveContext): PrimitiveFile[] {
    const {subject, object} = ctx;
    switch (ctx.kind) {
        case 'register':
            return [{path: 'meta/db/db.ts', content: schemaRegisterSource(subject, object)}];
        case 'procedure':
            return [
                {
                    path: `meta/db/schema/${object}.sql`,
                    content: schemaProcedureSource(subject, object),
                },
            ];
        default:
            return [{path: 'meta/type/schema.ts', content: schemaTableSource(subject, object)}];
    }
}

const schema: PrimitiveDescriptor = {
    id: 'schema',
    title: 'Database schema',
    skill: 'blong-schema',
    summary:
        'Declarative tables (meta/type/schema.ts), registration order (meta/db/db.ts) and ' +
        'stored procedures (meta/db/schema/*.sql).',
    kinds: ['table', 'register', 'procedure'],
    defaultKind: 'table',
    roots: ['meta/type', 'meta/db'],
    check(ctx) {
        return checkSubject(ctx.subject);
    },
    files(ctx) {
        return schemaFiles(ctx);
    },
    compose({host, root, context}) {
        const {subject, object} = context;
        if (context.kind === 'table') {
            // Every `meta/type/*.ts` in a realm merges into `schema[<realm>]`, so a
            // second file is additive — the tables declared in schema.ts survive.
            // Adding a table therefore never has to rewrite the shared file.
            const shared = readGenerated(host, root, 'meta/type/schema.ts');
            if (!shared) return schemaFiles(context);
            return [{path: `meta/type/${object}.ts`, content: schemaTableSource(subject, object)}];
        }
        if (context.kind === 'register') {
            const existing = readGenerated(host, root, 'meta/db/db.ts');
            if (!existing) return schemaFiles(context);
            const merged = insertMapEntry(existing, 'tables', `${subject}.${object}`, 2);
            if (merged === undefined) return schemaFiles(context);
            return [{path: 'meta/db/db.ts', content: merged}];
        }
        return schemaFiles(context);
    },
};

export default schema;
