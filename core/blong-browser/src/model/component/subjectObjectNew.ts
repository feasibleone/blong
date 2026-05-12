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
            function NewPage(props: Record<string, unknown>) {
                return Editor({
                    schema,
                    cards: model.cards as Record<string, ICardConfig>,
                    layout: 'edit',
                    layouts: model.layouts as Record<string, LayoutConfig>,
                    loadAction: methods.get,
                    saveAction: methods.add,
                    value: {},
                    editMode: true,
                    editable: false,
                    ...props,
                });
            }

            return NewPage as unknown as React.ComponentType;
        },
    });
}
