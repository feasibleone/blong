import {adapter} from '@feasibleone/blong';

export default adapter<{
    mongodb: {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
    };
}>(() => ({
    extends: 'adapter.mongodb',
    activation: {
        default: {
            mongodb: {
                host: 'localhost',
                port: 27017,
                database: 'blong-integration',
                // user: 'blong-test',
                // password: 'password',
            },
            namespace: 'mongo',
            imports: [],
        },
    },
}));
