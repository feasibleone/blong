import {adapter} from '@feasibleone/blong';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default adapter<{
    knex: {
        connection: {
            database: string;
            user: string;
            password: string;
        };
    };
}>(({schema}) => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            knex: {
                connection: {
                    database: 'blong-integration',
                    user: 'blong-test',
                    password: 'password',
                },
            },
            namespace: 'sql',
            // `/\.db$/` attaches the core realm's schema config so the
            // `core_resource` / `core_type` / `core_triple` tables sync, letting
            // the adapter tests exercise the resource-backed + graph-edge CRUD.
            imports: [/\.sql$/, /\.db$/],
            schema: {
                sync: true,
                seed: true,
                dropColumns: true,
                tables: {
                    sql_item: {
                        definition: schema.mysql.item,
                        order: 1,
                    },
                    // Resource-backed entity — PK is FK → core.resource, display
                    // name lives in core_resource.resourceName (virtual
                    // `${object}Name`). Generic add generates the PK + resource,
                    // find/get join the name, edit renames, remove cascades.
                    'sql.person': {
                        definition: schema.mysql.person,
                        order: 11,
                        resource: true,
                    },
                    // Resource-backed entity with a `hasMember` graph edge →
                    // person: get attaches members, add/edit sync the edges,
                    // remove cleans them.
                    'sql.team': {
                        definition: schema.mysql.team,
                        order: 12,
                        resource: true,
                        edges: [
                            {
                                predicate: 'hasMember',
                                table: 'sql_person',
                                object: 'person',
                                objectKey: 'personId',
                                nameField: 'personName',
                                granted: true,
                            },
                        ],
                    },
                    // `type.ulid()` / `type.uuid()` PKs — the generic add
                    // generates the key server-side from the default marker.
                    'sql.ulid': {
                        definition: schema.mysql.ulidItem,
                        order: 13,
                    },
                    'sql.uuid': {
                        definition: schema.mysql.uuidItem,
                        order: 14,
                    },
                },
                // The generic graph-edge sync calls `access_pathRefresh()`; a
                // no-op keeps the edge wiring testable without the full RBAC
                // realm (the real rebuild is covered by blong-access).
                procedures: {
                    access_pathRefresh:
                        'CREATE PROCEDURE access_pathRefresh() BEGIN SET @blong_pfr = 1; END',
                },
                procedurePaths: [join(__dirname, 'sql/schema')],
            },
        },
    },
}));
