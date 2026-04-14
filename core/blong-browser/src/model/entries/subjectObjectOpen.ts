import type {IResolvedModelSpec} from '@feasibleone/blong';
import type {LayoutConfig} from '../../hooks/useLayout.js';
import type {ICardConfig, IEnrichedSchema} from '../../types/widget.js';

export function subjectObjectOpen(
    model: IResolvedModelSpec,
    loadSchema: () => Promise<IEnrichedSchema>,
) {
    const {objectTitle, keyField, browser, methods} = model;

    return async (params?: Record<string, unknown>) => ({
        title: `Edit ${objectTitle}`,
        permission: browser.permission.edit,
        icon: 'pi pi-pencil',
        params,
        component: async () => {
            const [schema, {Editor}] = await Promise.all([
                loadSchema(),
                import('../../components/Editor/index.js'),
            ]);

            function OpenPage(props: Record<string, unknown>) {
                const loadParams = params ? {[keyField]: params[keyField]} : undefined;
                return Editor({
                    schema,
                    cards: model.cards as Record<string, ICardConfig>,
                    layout: 'edit',
                    layouts: model.layouts as Record<string, LayoutConfig>,
                    loadAction: methods.get,
                    loadParams,
                    saveAction: methods.edit,
                    editable: true,
                    ...props,
                });
            }

            return OpenPage as unknown as React.ComponentType;
        },
    });
}

declare const React: typeof import('react');
