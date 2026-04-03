import type {IEnrichedSchema} from '../../types/widget.js';
import type {IResolvedModelSpec} from '../types.js';

export function subjectObjectBrowse(
    model: IResolvedModelSpec,
    loadSchema: () => Promise<IEnrichedSchema>,
) {
    const {subject, object, browser, methods} = model;

    return async () => ({
        title: browser.title,
        permission: browser.permission.browse,
        icon: browser.icon,
        component: async (_params: Record<string, unknown>) => {
            const [schema, {Explorer}] = await Promise.all([
                loadSchema(),
                import('../../components/Explorer/index.js'),
            ]);

            function BrowsePage(props: Record<string, unknown>) {
                const columns = (model.cards?.browse?.widgets as string[] | undefined)
                    ?.filter(w => typeof w === 'string')
                    .map(w => ({field: w.includes('.') ? w.split('.').pop()! : w}));

                return Explorer({
                    schema,
                    columns,
                    listAction: methods.find,
                    selectionMode: 'single',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: `${subject}.${object}.new`,
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

declare const React: typeof import('react');
