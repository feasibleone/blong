import type {IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';
import type {IEnrichedSchema} from '../../types/widget.js';

export async function subjectObjectBrowse(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
) {
    const {subject, object, browser, methods, keyField} = model;

    return async () => ({
        title: browser.title,
        permission: browser.permission.browse,
        icon: browser.icon,
        component: async () => {
            const [schemaOverride, {Explorer}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Explorer/index.js'),
            ]);

            const schema = blong.lib.merge({}, model.schema, schemaOverride);
            function BrowsePage(props: Record<string, unknown>) {
                const columns = (model.cards?.browse?.widgets).map(widget => {
                    if (typeof widget === 'string') {
                        const field = widget.split('.').pop()!;
                        return {
                            field,
                            ...schema.properties?.[object]?.properties?.[field],
                        };
                    } else
                        return {
                            field: widget.name,
                        };
                });

                return Explorer({
                    schema,
                    columns,
                    listAction: methods.find,
                    selectionMode: 'single',
                    keyField,
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: `component/${subject}.${object}.new`,
                            permission: browser.permission.add,
                        },
                    ],
                    toolbarRight: [],
                    ...props,
                });
            }

            return BrowsePage as unknown as React.ComponentType;
        },
    });
}
