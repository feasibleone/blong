import {adapter, type IHandlerProxy} from '@feasibleone/blong';

export default adapter<{
    mock?: boolean;
}>(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'backend',
            imports: ['codec.jsonrpc', 'codec.mle'],
            url: globalThis.window?.location?.origin ?? 'http://localhost:8080',
        },
        browser: {
            logLevel: 'debug',
        },
        storybook: {
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
