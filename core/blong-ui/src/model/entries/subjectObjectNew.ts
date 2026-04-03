import type {LayoutConfig} from '../../hooks/useLayout.js';
import type {ICardConfig, IEnrichedSchema} from '../../types/widget.js';
import type {IResolvedModelSpec} from '../types.js';

export function subjectObjectNew(
    model: IResolvedModelSpec,
    loadSchema: () => Promise<IEnrichedSchema>,
) {
    const {objectTitle, browser, methods} = model;

    return async () => ({
        title: `Create ${objectTitle}`,
        permission: browser.permission.add,
        icon: 'pi pi-plus',
        component: async () => {
            const [schema, {Editor}] = await Promise.all([
                loadSchema(),
                import('../../components/Editor/index.js'),
            ]);

            function NewPage(props: Record<string, unknown>) {
                return Editor({
                    schema,
                    cards: model.cards as Record<string, ICardConfig>,
                    layout: 'edit',
                    layouts: model.layouts as Record<string, LayoutConfig>,
                    saveAction: methods.add,
                    editMode: true,
                    editable: false,
                    ...props,
                });
            }

            return NewPage as unknown as React.ComponentType;
        },
    });
}

declare const React: typeof import('react');
