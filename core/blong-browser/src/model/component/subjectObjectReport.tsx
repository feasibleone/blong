import type {IEnrichedSchema, IHandlerProxy, IResolvedModelSpec} from '@feasibleone/blong';

export async function subjectObjectReport(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
) {
    const {methods, subject, object, nameField, keyField} = model;
    const {title, permission} = model.report!;

    return async () => ({
        title,
        permission,
        icon: 'pi pi-chart-bar',
        component: async () => {
            const [schema, {Report}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Report/Report.js'),
            ]);

            return function ReportPage(props: Record<string, unknown>) {
                return (
                    <Report
                        filterSchema={schema}
                        dataAction={methods.report}
                        columns={[keyField, nameField].map(field => ({
                            field: field.split('.').pop()!,
                            header: schema.properties?.[field]?.title || field,
                        }))}
                        {...props}
                    />
                );
            };
        },
    });
}
