import {adapter, type IHandlerProxy} from '@feasibleone/blong';
import mock from '../src/model/mock/index.ts';

export default adapter(blong => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'backend',
            imports: [/\.model$/],
            url: 'http://localhost:8080',
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
            return await mock(models, layerApi);
        }
    },
}));
