import {handler} from '@feasibleone/blong';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const _schemaDir = join(dirname(fileURLToPath(import.meta.url)), 'schema');

export default handler(() => ({
    config: {
        schema: {
            tables: {
                'access.user': 200,
                'access.credential': 201,
                'access.action': 202,
                'access.capability': 203,
                'access.role': 204,
                'access.access': 205,
                'access.policy': 206,
                'access.flow': 207,
                'access.session': 208,
                'access.audit': 209,
            },
            procedurePaths: [_schemaDir],
            accessPathRefresh: true,
        },
    },
}));
