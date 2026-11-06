import type {
    IEnrichedSchema,
    IHandlerProxy,
    IResolvedModelSpec,
    IToolbarButton,
} from '@feasibleone/blong';

export async function subjectObjectBrowse(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
) {
    const {subject, object, browser, cards, layouts, keyField, methods, deletion} = model;

    /**
     * The model's own delete button carries the model's deletion mode — the four
     * behaviours are configured once on the model rather than repeated on a toolbar.
     *
     * The scan action defaults to the object's own `scan`, which the validation
     * generator declares for every public model: a realm that configures a deletion
     * mode writes no handler for it. `@@D-784`
     */
    const withDeletion = (button: IToolbarButton): IToolbarButton =>
        button.method === methods.remove
            ? {
                  ...button,
                  deletion: {
                      ...deletion,
                      mode: deletion?.mode ?? 'prompt',
                      entity: `${subject}.${object}`,
                      keyField,
                      edit: methods.edit,
                      get: methods.get,
                      scan: deletion?.scan ?? `${subject}.${object}.scan`,
                  },
              }
            : button;

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
                        ...(browser.toolbar ?? []).map(withDeletion),
                    ],
                    cards,
                    layouts,
                    layout: 'browse',
                    editable: false,
                    editMode: false,
                    refreshNamespace: `${subject}.${object}`,
                    title: browser.title,
                    className: 'blong-subject-object-browse',
                    feedbackContext: {subject, object, page: 'browse'},
                    ...props,
                });
            }

            return BrowsePage as unknown as React.ComponentType;
        },
    });
}
