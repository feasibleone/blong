import {handler} from '@feasibleone/blong';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const _schemaDir = join(dirname(fileURLToPath(import.meta.url)), 'schema');

export default handler(() => ({
    config: {
        schema: {
            tables: {
                // Resource-backed tables use the generic CRUD's resource +
                // graph-edge handling (`ISchemaTable.resource` / `edges`):
                //   - `access.role` — full generic CRUD (name join, hasCapability
                //     pivot edges, reverse hasRole cleanup on remove).
                //   - browse-only entities — generic find joins resourceName as
                //     `${object}Name` (`resource: true`).
                // `access.user` / `access.capability` keep their custom handlers
                // (credentials, session cleanup, and the CRUD-action pivot).
                'access.user': 200,
                'access.credential': 201,
                'access.action': {order: 202, resource: true},
                'access.capability': {order: 203, resource: true},
                'access.role': {
                    order: 204,
                    resource: true,
                    edges: [
                        {
                            predicate: 'hasCapability',
                            table: 'access_capability',
                            object: 'capability',
                            objectKey: 'capabilityId',
                            nameField: 'capabilityName',
                            granted: true,
                        },
                        {
                            // Reverse edge cleaned up on remove (users → role).
                            predicate: 'hasRole',
                            reverse: true,
                        },
                    ],
                },
                'access.access': {order: 205, resource: true},
                'access.policy': {order: 206, resource: true},
                'access.flow': {order: 207, resource: true},
                'access.session': 208,
                'access.audit': 209,
            },
            procedurePaths: [_schemaDir],
            accessPathRefresh: true,
        },
    },
}));
