import type {IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';
import type {LayoutConfig} from '../../hooks/useLayout.js';
import type {ICardConfig, IEnrichedSchema} from '../../types/widget.js';

export function subjectObjectNew(model: IResolvedModelSpec) {
    const {objectTitle, browser, methods, subject, object} = model;

    return async (blong: Pick<IHandlerProxy<{}>, 'handler'>) => ({
        title: `Create ${objectTitle}`,
        permission: browser.permission.add,
        icon: 'pi pi-plus',
        component: async (params: object) => {
            const [schema, {Editor}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
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
