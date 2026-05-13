import type {
    ICardConfig,
    IEnrichedSchema,
    IHandlerProxy,
    IResolvedModelSpec,
} from '@feasibleone/blong';
import type {LayoutConfig} from '../../hooks/useLayout.js';

export async function subjectObjectOpen(model: IResolvedModelSpec, blong: IHandlerProxy<unknown>) {
    const {objectTitle, keyField, browser, methods, subject, object} = model;

    return async () => ({
        title: `Edit ${objectTitle}`,
        permission: browser.permission.edit,
        icon: 'pi pi-pencil',
        component: async (params?: Record<string, unknown>) => {
            const [schemaOverride, {Editor}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Editor/Editor.js'),
            ]);

            const schema = blong.lib.merge({}, model.schema, schemaOverride);
            const loadParams = params ? {[keyField]: params[keyField]} : undefined;
            function OpenPage(props: Record<string, unknown>) {
                return Editor({
                    schema,
                    cards: model.cards as Record<string, ICardConfig>,
                    layout: 'edit',
                    layouts: model.layouts as Record<string, LayoutConfig>,
                    loadAction: methods.get,
                    loadParams,
                    saveAction: methods.edit,
                    mode: 'edit',
                    editable: true,
                    title: `Edit ${objectTitle}`,
                    ...props,
                });
            }

            return OpenPage;
        },
    });
}
