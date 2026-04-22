import type {IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';

export async function subjectDropdownList(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
) {
    const {subject, object, browser, methods} = model;

    return async () => ({});
}
