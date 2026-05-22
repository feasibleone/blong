import type {
    IEnrichedSchema,
    IHandlerProxy,
    IReportDefinition,
    IResolvedModelSpec,
} from '@feasibleone/blong';
import React from 'react';

/** Capitalise the first character of a string */
function capital(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the report schema from the model.
 *
 * - `params` card fields: flat filter fields extracted from `object` properties where
 *   `filter: true` (or the explicit list in `reportDef.params`).
 * - `result` table field: array widget using `listAction` + columns from the model or reportDef.
 *
 * The params are stored as flat top-level fields so they are passed directly as filter params
 * to the `listAction` (e.g. `{coralName: 'Pink', paging: {...}}`).  This is compatible with
 * the standard `find` API which accepts flat filter keys alongside `paging` / `orderBy`.
 */
function buildReportSchema(
    model: IResolvedModelSpec,
    mergedSchema: IEnrichedSchema,
    reportDef: IReportDefinition,
): IEnrichedSchema {
    const {object, keyField} = model;
    const objectProps =
        (mergedSchema.properties?.[object]?.properties as Record<string, unknown> | undefined) ??
        {};

    // Params: either explicit list or all fields with filter: true
    const paramFields =
        reportDef.params ??
        Object.entries(objectProps)
            .filter(([, v]) => (v as {filter?: boolean}).filter)
            .map(([k]) => k);

    // Columns: explicit list from reportDef, or browse columns from model widget config, or nameField
    const browseColumns = reportDef.columns ??
        (mergedSchema.properties?.[object]?.widget?.columns as string[] | undefined) ?? [
            model.nameField.split('.').pop()!,
        ];

    // Build properties for the result table items from object schema
    const resultItemProperties = Object.fromEntries(
        browseColumns
            .map(col => [col, objectProps[col] ?? {}] as const)
            .concat([[keyField, objectProps[keyField] ?? {}]]),
    );

    return {
        properties: {
            // Flat filter fields (from the object's own properties)
            ...Object.fromEntries(paramFields.map(f => [f, objectProps[f] ?? {}])),
            // Result table
            result: {
                type: 'array',
                title: '',
                widget: {
                    type: 'table',
                    listAction: reportDef.action ?? model.methods.find,
                    columns: browseColumns,
                    keyField,
                    resultSet: reportDef.resultSet ?? 'items',

                    // Disable row-level edit/delete actions in the result table
                    actions: {allowEdit: false, allowDelete: false},
                },
                items: {properties: resultItemProperties},
            },
        },
    };
}

/**
 * Report page factory.
 *
 * Builds an Editor-based report page with two cards:
 * - **params**: filter fields that the user fills in before running the report.
 * - **result**: a server-fetched table that populates when the user clicks "Run Report".
 *
 * @param model    Resolved model spec.
 * @param blong    Handler proxy from the orchestrator context.
 * @param reportId Optional report identifier. Defaults to `${subject}${Capital(object)}List`
 *                 which generates a standard list report using `methods.find`.
 */
export async function subjectObjectReport(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
    reportId?: string,
) {
    const {subject, object} = model;

    // Resolve which report definition to use
    const defaultId = `${subject}${capital(object)}List`;
    const id = reportId ?? defaultId;
    const reportDef: IReportDefinition = model.reports[id] ?? {};

    const title = reportDef.title ?? model.report.title;
    const permission = reportDef.permission ?? model.report.permission;

    return async () => ({
        title,
        permission,
        icon: 'pi pi-chart-bar',
        component: async () => {
            const [schemaOverride, {Editor}] = await Promise.all([
                blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
                import('../../components/Editor/Editor.js'),
            ]);

            const mergedSchema = blong.lib.merge({}, model.schema, schemaOverride);
            const reportSchema = buildReportSchema(model, mergedSchema, reportDef);

            // Params card: all flat filter fields (everything except 'result')
            const paramWidgets = Object.keys(reportSchema.properties ?? {}).filter(
                k => k !== 'result',
            );

            const reportCards = {
                params: {
                    label: '',
                    widgets: paramWidgets,
                    className: 'col-12',
                    fieldClass: ' md:col-4 xl:col-3',
                },
                result: {
                    label: 'Results',
                    widgets: ['result'],
                    className: 'col-12',
                },
            };

            const reportLayouts = {report: ['params', 'result']};

            // eslint-disable-next-line @eslint-react/component-hook-factories
            function ReportPage(props: Record<string, unknown>) {
                return (
                    <Editor
                        schema={reportSchema}
                        cards={reportCards}
                        layouts={reportLayouts}
                        layout="report"
                        queryAction={reportDef.action ?? model.methods.find}
                        editable={false}
                        {...(props as React.ComponentProps<typeof Editor>)}
                    />
                );
            }

            return ReportPage as unknown as React.ComponentType;
        },
    });
}
