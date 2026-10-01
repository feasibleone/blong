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
        /**
         * Storybook, reading a real gateway over plain JSON-RPC.
         *
         * No mock, so the model handlers travel to the gateway; `codec.mle` is
         * deliberately absent — the Storybook dev-server plugin terminates the
         * MLE for these calls (it holds the token and decrypts the response),
         * which is what lets the page speak plain JSON.  Activated by the
         * `backend: 'jsonrpc'` toolbar choice through the `storybookJsonrpc`
         * intent.
         */
        storybookJsonrpc: {
            mock: false,
            imports: [/\.model$/, /\.fixture$/, 'codec.jsonrpc'],
        },
        /**
         * Storybook, reading a real gateway with the app's own encryption.
         *
         * Same as `storybookJsonrpc` but the page keeps `codec.mle`, so its
         * requests are encrypted end to end; the dev-server plugin only supplies
         * the token.  Activated by the `backend: 'mle'` toolbar choice.
         */
        storybookMle: {
            mock: false,
            imports: [/\.model$/, /\.fixture$/, 'codec.jsonrpc', 'codec.mle'],
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
