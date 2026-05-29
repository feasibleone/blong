import {adapter, type IHandlerProxy} from '@feasibleone/blong';

export default adapter<{
    knex: {
        connection: {
            database: string;
            user: string;
            password: string;
        };
    };
    mock?: boolean;
}>(() => ({
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
            namespace: 'db',
            imports: [/\.db$/],
        },
        microservice: {
            mock: true,
            imports: [/\.model$/, /\.fixture$/],
        },
    },
    async createHandlers({
        handlers,
        layerApi,
        kind,
    }: {
        handlers: object;
        layerApi: IHandlerProxy<unknown>;
        kind: string;
    }) {
        if (this.config?.mock && kind === 'model') {
            const {mock} = await import('@feasibleone/blong-mock');
            const models = await Promise.all(Object.values(handlers).map(model => model()));
            return await mock.apply(this, [models, layerApi]);
        }
    },
}));
