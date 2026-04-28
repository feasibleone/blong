import {adapter} from '@feasibleone/blong';

export default adapter<{
    mongodb: {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
    };
}>(api => ({
    extends: 'adapter.mongodb',
    activation: {
        default: {
            mongodb: {
                host: 'localhost',
                port: 30017,
                database: 'blong-integration',
                user: 'blong-test',
                password: 'password',
            },
            namespace: 'mongo',
            imports: [],
        },
    },
}));
