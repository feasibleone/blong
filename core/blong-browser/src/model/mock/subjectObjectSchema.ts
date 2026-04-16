import type {IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';

export function subjectObjectSchema(model: IResolvedModelSpec) {
    const {objectTitle, browser, methods, subject, object} = model;
    return async (blong: Pick<IHandlerProxy<{}>, 'handler'>) => async () => {
        return {};
    };
}
