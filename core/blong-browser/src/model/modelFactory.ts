import type {IHandlerProxy, IModelSpec} from '@feasibleone/blong';

import component from './component/index.js';
export function modelFactory(models: IModelSpec[]) {
    return async (blong: Pick<IHandlerProxy<{}>, 'handler'>) => {
        const components = await component(models, blong);
        return components;
    };
}
