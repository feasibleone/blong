import type {
    ICardConfig,
    IEnrichedSchema,
    IHandlerProxy,
    IResolvedModelSpec,
} from '@feasibleone/blong';
import type {LayoutConfig} from '../../hooks/useLayout.js';

export async function subjectObjectNew(model: IResolvedModelSpec, blong: IHandlerProxy<unknown>) {
    const {objectTitle, browser, methods, subject, object} = model;

    return async () => ({
        title: `Create ${objectTitle}`,
        permission: browser.permission.add,
        icon: 'pi pi-plus',
        component: async () => {
            const [schemaOverride, {Editor}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Editor/Editor.js'),
            ]);

            const schema = blong.lib.merge({}, model.schema, schemaOverride);
            // Hoisted outside NewPage so the object reference is stable across renders —
            // an inline object literal would create a new identity on every render and
            // trigger the Editor's tab-title effect every time, causing an infinite loop.
            const title = {new: `Create ${objectTitle}`, edit: `Edit ${objectTitle}`};
            function NewPage(props: Record<string, unknown>) {
                return Editor({
                    schema,
                    cards: model.cards as Record<string, ICardConfig>,
                    layout: 'edit',
                    layouts: model.layouts as Record<string, LayoutConfig>,
                    loadAction: methods.get,
                    createAction: methods.add,
                    saveAction: methods.edit,
                    value: {},
                    mode: 'new',
                    editable: false,
                    title,
                    ...props,
                });
            }

            return NewPage as unknown as React.ComponentType;
        },
    });
}
