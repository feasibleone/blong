/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 */
import type {IModelSpec, IPropertyOverride, IResolvedModelSpec} from '@feasibleone/blong';
import {mergeWithSymbols} from '@feasibleone/blong-lib';

/** Capitalize the first letter, skipping a leading `$` placeholder (`$object` → `$Object`). */
function capital(s: string): string {
    return s.replace(/^(\$*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/**
 * Apply standard defaults to a partial ModelSpec.
 *
 * @param spec - Partial model spec provided by the realm
 * @returns Fully resolved model spec with all defaults filled in
 */
export function withDefaults(spec: IModelSpec): IResolvedModelSpec {
    const {subject, object} = spec;
    const objectTitle = spec.objectTitle ?? capital(object);
    const keyField = spec.keyField ?? `${object}Id`;
    const nameField = spec.nameField ?? `${object}.${object}Name`;

    // ── Master-detail (IModelSpec.details) ─────────────────────────────────
    // Each detail entity becomes an array property at the SAME level as the
    // master record's dedicated key — `schema.properties[object]` (master) and
    // `schema.properties[detail.object]` (detail arrays) are siblings. The
    // detail-ROW schema (`items.properties`) is declared by the realm on that
    // sibling and deep-merges in here (mergeWithSymbols); we fill in the array
    // typing, the editable table widget, a card and a tab.
    const details = spec.details ?? [];
    const detailSchemaProps: Record<string, IPropertyOverride> = {};
    const detailCards: Record<string, {label: string; widgets: string[]}> = {};
    for (const detail of details) {
        const detailObjectTitle = capital(detail.object);
        detailSchemaProps[detail.object] = {
            type: 'array',
            title: detailObjectTitle,
            widget: {
                type: 'table',
                keyField: detail.keyField ?? `${detail.object}Id`,
                actions: {allowAdd: true, allowEdit: true, allowDelete: true},
            },
            items: {
                type: 'object',
                properties: {},
            },
            // `items` carries `type` (schema semantics) beyond IPropertyOverride's
            // narrow `items` declaration.
        } as IPropertyOverride;
        const cardId = `details-${detail.object}`;
        detailCards[cardId] = {
            label: detailObjectTitle,
            widgets: [detail.object],
        };
    }
    const editLayout =
        details.length > 0
            ? {
                  items: [
                      {id: 'edit', label: objectTitle, widgets: ['edit']},
                      ...details.map(detail => ({
                          id: `details-${detail.object}`,
                          label: capital(detail.object),
                          widgets: [`details-${detail.object}`],
                      })),
                  ],
              }
            : ['edit', 'hidden'];

    return mergeWithSymbols<IResolvedModelSpec, IModelSpec>(
        {
            subject,
            subjectTitle: capital(subject),
            object,
            objectTitle,
            keyField,
            nameField,
            public: false,
            details: spec.details ?? [],
            schema: {
                properties: {
                    [object]: {
                        properties: {
                            [keyField]: {},
                            [nameField.split('.').pop()!]: {
                                title: `${objectTitle} Name`,
                                filter: true,
                                sort: true,
                                action: `component/${subject}.${object}.open`,
                            },
                        },
                        title: '',
                        widget: {
                            type: 'table',
                            listAction: `${subject}.${object}.find`,
                            keyField,
                            selectionMode: 'single',
                            columns: [nameField.split('.').pop()!],
                            parent: '$.selected.navigator',
                        },
                    },
                    // Detail arrays are SIBLINGS of the master object — the
                    // realm declares their `items.properties` on these keys.
                    ...detailSchemaProps,
                    navigator: {
                        title: '',
                        type: 'array',
                        widget: {
                            type: 'navigator',
                        },
                    },
                },
            },
            cards: {
                edit: {
                    label: objectTitle,
                    widgets: [nameField],
                },
                hidden: {
                    hidden: true,
                    label: 'Hidden fields',
                    widgets: [`${object}.${keyField}`],
                },
                navigator: {
                    label: '',
                    widgets: ['navigator'],
                },
                browse: {
                    label: '',
                    widgets: [object],
                },
                detail: {
                    label: '',
                    readOnly: true,
                    watch: `$.selected.${object}`,
                    widgets: [`$.edit.${object}.${nameField.split('.').pop()!}`],
                },
                ...detailCards,
            },
            browser: {
                title: `Browse ${objectTitle}`,
                icon: 'pi pi-list',
                permission: {
                    browse: `${subject}.${object}.browse`,
                    add: `${subject}.${object}.add`,
                    edit: `${subject}.${object}.edit`,
                    delete: `${subject}.${object}.remove`,
                },
                resultSet: object,
                toolbar: [
                    {
                        label: 'Create',
                        icon: 'pi pi-plus',
                        action: `component/${subject}.${object}.new`,
                        permission: `${subject}.${object}.add`,
                    },
                    {
                        label: 'Edit',
                        icon: 'pi pi-pencil',
                        enabled: 'current' as const,
                        method: `component/${subject}.${object}.open`,
                        params: '${current}',
                    },
                    {
                        label: 'Delete',
                        icon: 'pi pi-trash',
                        enabled: 'selected' as const,
                        confirm: 'Delete selected record?',
                        method: `${subject}.${object}.remove`,
                        refresh: true,
                        params: {[keyField]: '${' + keyField + '}'},
                    },
                ],
                filter: {},
            },
            editor: {
                resultSet: object,
            },
            report: {
                title: `${objectTitle} Report`,
                permission: `${subject}.${object}.report`,
            },
            layouts: {
                edit: editLayout,
                browse: {
                    type: 'split',
                    panels: [
                        {size: 20, minSize: 10, cards: ['navigator']},
                        {size: 50, minSize: 30, cards: ['browse']},
                        {size: 30, minSize: 15, cards: ['detail']},
                    ],
                },
            },
            reports: {},
            methods: {
                find: `${subject}.${object}.find`,
                get: `${subject}.${object}.get`,
                add: `${subject}.${object}.add`,
                edit: `${subject}.${object}.edit`,
                remove: `${subject}.${object}.remove`,
                report: `${subject}.${object}.report`,
            },
        },
        spec,
    ) as unknown as IResolvedModelSpec;
}
