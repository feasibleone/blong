import {adapter} from '@feasibleone/blong';

/**
 * `mongo-dev` adapter instance — MongoDB explorer source for the commander
 * dev suite. Extends the generic `adapter.mongodb` base (blong-gogo) with the
 * `mongo-dev` instance namespace so commander triples like
 * `mongo-dev.database.list` / `mongo-dev.collection.list` reach this instance.
 */
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
            },
            namespace: 'mongo-dev',
            imports: [],
        },
    },
}));
