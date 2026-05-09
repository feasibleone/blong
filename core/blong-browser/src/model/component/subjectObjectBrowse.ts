import type {IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';
import type {IEnrichedSchema} from '../../types/widget.js';

export async function subjectObjectBrowse(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
) {
    const {subject, object, browser, cards, layouts} = model;

    return async () => ({
        title: browser.title,
        permission: browser.permission.browse,
        icon: browser.icon,
        component: async () => {
            const [schemaOverride, {Editor}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Editor/index.js'),
            ]);

            const schema = blong.lib.merge({}, model.schema, schemaOverride);
            function BrowsePage(props: Record<string, unknown>) {
                return Editor({
                    schema,
                    toolbar: browser.toolbar,
                    cards,
                    layouts,
                    layout: 'browse',
                    editable: false,
                    editMode: false,
                    ...props,
                });
            }

            return BrowsePage as unknown as React.ComponentType;
        },
    });
}
