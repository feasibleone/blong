import {adapter} from '@feasibleone/blong';

export default adapter<{
    connection: {
        'metadata.broker.list': string;
        [key: string]: unknown;
    };
    consume: {
        topics: string[];
        groupId: string;
    };
}>(api => ({
    extends: 'adapter.kafka',
    activation: {
        default: {
            connection: {
                'client.id': 'blong-test',
                'metadata.broker.list': 'localhost:30092',
                'security.protocol': 'plaintext',
            },
            consume: {
                topics: ['blong-test'],
                groupId: 'blong-test-group',
            },
            namespace: 'broker',
            imports: ['kafka.broker'],
        },
    },
}));
