import {handler} from '@feasibleone/blong';

export default handler(() => ({
    config: {
        schema: {
            tables: {
                'core.resource': 1,
                'core.type': 1,
                'core.property': 1,
                'core.triple': 1,
                'core.translation': 1,
                'core.path': 1,
            },
        },
    },
}));
