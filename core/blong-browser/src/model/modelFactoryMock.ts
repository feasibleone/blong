import type { IHandlerProxy, IModelSpec } from '@feasibleone/blong';

import component from './component/index.js';
import mock from './mock/index.js';
export function modelFactoryMock(models: IModelSpec[]) {
    return async (blong: Pick<IHandlerProxy<{}>, 'handler'>) => {
        const components = await component(models, blong);
        const mockComponents = await mock(models, blong);
        return {...components, ...mockComponents};
    };
}
