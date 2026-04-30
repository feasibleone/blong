import {adapter, type IHandlerProxy} from '@feasibleone/blong';
import mock from '../src/model/mock/subjectObjectMock.ts';

export default adapter(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'backend',
            imports: [/\.model$/, /\.fixture$/],
            url: 'http://localhost:8080',
        },
        browser: {
            logLevel: 'info',
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
        if (kind === 'model') {
            const models = await Promise.all(Object.values(handlers).map(model => model()));
            return await mock.apply(this, [models, layerApi]);
        }
    },
}));
