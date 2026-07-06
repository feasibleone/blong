import type {IEnrichedSchema, IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';

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
                blong.handler.subjectObjectSchema<IEnrichedSchema>({subject, object}, {}),
                import('../../components/Editor/Editor.js'),
            ]);

            const schema = blong.lib.merge({}, model.schema, schemaOverride);
            function BrowsePage(props: Record<string, unknown>) {
                return Editor({
                    schema,
                    toolbar: [
                        {label: '', icon: 'pi pi-refresh', action: '__refresh__', title: 'Refresh'},
                        ...(browser.toolbar ?? []),
                    ],
                    cards,
                    layouts,
                    layout: 'browse',
                    editable: false,
                    editMode: false,
                    refreshNamespace: `${subject}.${object}`,
                    title: browser.title,
                    className: 'blong-subject-object-browse',
                    ...props,
                });
            }

            return BrowsePage as unknown as React.ComponentType;
        },
    });
}
