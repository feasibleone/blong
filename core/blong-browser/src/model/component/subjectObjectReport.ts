import type {IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';
import type {IEnrichedSchema} from '../../types/widget.js';

export async function subjectObjectReport(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
) {
    const {methods, subject, object} = model;
    const {title, permission} = model.report!;

    return async () => ({
        title,
        permission,
        icon: 'pi pi-chart-bar',
        component: async () => {
            const [schema, {Report}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Report/index.js'),
            ]);

            function ReportPage(props: Record<string, unknown>) {
                return Report({
                    filterSchema: schema,
                    dataAction: methods.report,
                    ...props,
                });
            }

            return ReportPage as unknown as React.ComponentType;
        },
    });
}

declare const React: typeof import('react');
