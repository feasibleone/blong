/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 * The interesting part is what a *declaration* implies. A model names its parent
 * once and gets the navigator, the tree and the cascade from it; names nothing
 * and is a plain table. A model never names its sort and is ordered by its name
 * column, because a paged table that is unordered can show a row twice and lose
 * another between pages.
 */
import type {
    IModelParent,
    IModelParentResolved,
    IModelSort,
    IModelSpec,
    IPropertyOverride,
    IResolvedModelSpec,
} from '@feasibleone/blong';
import {mergeWithSymbols} from '@feasibleone/blong-lib';

/** Capitalize the first letter, skipping a leading `$` placeholder (`$object` → `$Object`). */
function capital(s: string): string {
    return s.replace(/^(\$*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/** The column a dotted field path addresses (`sport.sportName` → `sportName`). */
function columnOf(field: string): string {
    return field.split('.').pop()!;
}

/**
 * Fill in a parent declaration.
 *
 * A self-tree (`parent: 'unit'` on the unit model) is the case where the
 * navigator lists the model's own rows: the key is the record's own, the label is
 * its own name, and the field that names the parent is the declared one — the
 * default `parent<Object>Id`, since `<object>Id` is the record itself.
 */
function resolveParent(spec: IModelSpec, nameField: string): IModelParentResolved | undefined {
    const declared: IModelParent | string | undefined = spec.parent;
    if (!declared) return undefined;
    const parent = typeof declared === 'string' ? {object: declared} : declared;
    const subject = parent.subject ?? spec.subject;
    const object = parent.object ?? spec.object;
    const selfTree = subject === spec.subject && object === spec.object;
    const keyField = parent.keyField ?? `${object}Id`;
    const field = parent.field ?? (selfTree ? `parent${capital(object)}Id` : `${object}Id`);
    const labelField = parent.labelField ?? (selfTree ? columnOf(nameField) : `${object}Name`);
    // A tree needs the parent rows to name their own parent. A self-tree always
    // has one — it is the same field that points at the parent record.
    const parentField = parent.parentField ?? (selfTree ? field : undefined);
    return {
        subject,
        object,
        field,
        keyField,
        labelField,
        ...(parentField ? {parentField} : {}),
        listAction: parent.listAction ?? `${subject}.${object}.find`,
        ...(parent.listParams ? {listParams: parent.listParams} : {}),
        master: parent.master ?? {[field]: keyField},
    };
}

/**
 * The order a page is read in: its own declaration, else the name column its
 * model declared, else no order at all.
 *
 * The fallback is the *declared* name field, never the `${object}Name` default: a
 * column named after the object is a guess, and an order the table cannot resolve
 * fails the whole read (`Unknown column 'applicationName' in 'order clause'`) —
 * a page that cannot be read is worse than one read in an arbitrary order. A model
 * that names neither is reported by `modelWarnings()` instead.
 */
function resolveSort(
    sort: IModelSort | false | undefined,
    nameColumn: string | undefined,
): {field: string; dir: 'ASC' | 'DESC'} | false {
    if (sort === false) return false;
    if (sort === undefined) return nameColumn ? {field: nameColumn, dir: 'ASC'} : false;
    if (typeof sort === 'string') return {field: sort, dir: 'ASC'};
    const field = sort.field ?? nameColumn;
    return field ? {field, dir: sort.dir ?? 'ASC'} : false;
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
    const nameColumn = columnOf(nameField);
    const openLayout = spec.openLayout ?? 'edit';

    const parent = resolveParent(spec, nameField);
    // Only a name field the model *declared* determines the order; the default
    // `${object}Name` names a column that need not exist.
    const sort = resolveSort(
        spec.browser?.sort,
        spec.nameField === undefined ? undefined : nameColumn,
    );
    // The navigator is present because there is something to navigate — a parent
    // to list, or a widget the model configured itself. `browser.navigator` only
    // overrides that, so a realm no longer carries `navigator: false` on every
    // page to undo a default that guessed wrong. `@@D-827`
    const navigatorListAction = (
        spec.schema?.properties?.navigator?.widget as {listAction?: string} | undefined
    )?.listAction;
    const browserNavigator = spec.browser?.navigator ?? (!!parent || !!navigatorListAction);
    // A page ordered by a column the reader cannot click is still ordered right;
    // a page ordered by a column outside the default `columns` needs the header
    // sortable for the reader to change their mind.
    const sortableProperties: Record<string, IPropertyOverride> =
        sort && sort.field !== nameColumn ? {[sort.field]: {sort: true}} : {};

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
            // A realm may name its menu group itself (`Translations` for the two
            // core dictionary pages); the capitalized subject is only the default.
            subjectTitle: spec.subjectTitle ?? capital(subject),
            object,
            objectTitle,
            classifier: spec.classifier ?? false,
            menu: spec.menu ?? {},
            keyField,
            nameField,
            openLayout,
            parent,
            public: false,
            details: spec.details ?? [],
            schema: {
                properties: {
                    [object]: {
                        properties: {
                            [keyField]: {},
                            [nameColumn]: {
                                title: `${objectTitle} Name`,
                                filter: true,
                                sort: true,
                                action: `component/${subject}.${object}.open`,
                            },
                            ...sortableProperties,
                        },
                        title: '',
                        widget: {
                            type: 'table',
                            listAction: `${subject}.${object}.find`,
                            keyField,
                            selectionMode: 'single',
                            columns: [nameColumn],
                            // Selecting a node in the navigator narrows the table to
                            // that node's children, and only a model that declared a
                            // parent has one to narrow by.
                            parent: '$.selected.navigator',
                            ...(parent ? {master: parent.master} : {}),
                            ...(sort
                                ? {
                                      listParams: {
                                          orderBy: [{field: sort.field, dir: sort.dir}],
                                      },
                                  }
                                : {}),
                            // The browse table is a page of its own: it takes the
                            // height the split panel leaves it and scrolls its rows,
                            // so the paginator stays on screen and the header stays
                            // put while the reader scrolls.
                            scrollHeight: 'flex',
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
                            ...(parent
                                ? {
                                      listAction: parent.listAction,
                                      keyField: parent.keyField,
                                      labelField: parent.labelField,
                                      // A declared `parentField` is what makes the
                                      // navigator a tree instead of a list.
                                      ...(parent.parentField
                                          ? {parentField: parent.parentField}
                                          : {}),
                                      // No order is sent: the parent rows are
                                      // another model's table, and a column this
                                      // page guesses may not exist there. The
                                      // widget sorts the nodes it received.
                                      ...(parent.listParams ? {listParams: parent.listParams} : {}),
                                  }
                                : {}),
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
                    // The action the page actually calls. `browse` used to be
                    // `${subject}.${object}.browse`, which no role is ever granted:
                    // a menu that filters on this would hide every model page, and a
                    // permission check inside the page could never pass.
                    browse: `${subject}.${object}.find`,
                    add: `${subject}.${object}.add`,
                    edit: `${subject}.${object}.edit`,
                    delete: `${subject}.${object}.remove`,
                },
                resultSet: object,
                navigator: browserNavigator,
                sort,
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
                    panels: browserNavigator
                        ? [
                              {size: 20, minSize: 10, cards: ['navigator']},
                              {size: 50, minSize: 30, cards: ['browse']},
                              {size: 30, minSize: 15, cards: ['detail']},
                          ]
                        : [
                              {size: 70, minSize: 30, cards: ['browse']},
                              {size: 30, minSize: 15, cards: ['detail']},
                          ],
                },
            },
            reports: {},
            // A delete asks before it takes anything with it. `@@D-784`
            deletion: {mode: 'prompt'},
            methods: {
                find: `${subject}.${object}.find`,
                get: `${subject}.${object}.get`,
                add: `${subject}.${object}.add`,
                edit: `${subject}.${object}.edit`,
                remove: `${subject}.${object}.remove`,
                report: `${subject}.${object}.report`,
            },
        },
        // The two fields the defaults rewrite are not merged back in their raw
        // form: `parent: 'sport'` would replace the resolved parent object and
        // `sort: 'code'` the resolved order, undoing the derivation above.
        // `mergeWithSymbols` skips an `undefined` source value, so naming them
        // keeps the resolved ones.
        {
            ...spec,
            parent: undefined,
            browser: spec.browser ? {...spec.browser, sort: undefined} : undefined,
        },
    ) as unknown as IResolvedModelSpec;
}

/**
 * Everything a resolved model promises but does not state.
 *
 * Two of these are silent otherwise, and both cost the reader: a browse table is
 * always paged, so a page with no order may show a row twice and lose another
 * between two pages, and a navigator with nothing to list is a fifth of the page
 * spent on an empty panel. The aggregator logs what comes back here once, when
 * the pages are built.
 */
export function modelWarnings(model: IResolvedModelSpec): string[] {
    const warnings: string[] = [];
    if (model.browser.sort === false)
        warnings.push(
            `[${model.subject}.${model.object}] browse page is paged but no sort could be ` +
                `determined — declare \`nameField\` or \`browser.sort\`; without an order a ` +
                `row may appear twice and another on no page`,
        );
    const navigatorListAction = (
        model.schema.properties?.navigator?.widget as {listAction?: string} | undefined
    )?.listAction;
    if (model.browser.navigator && !navigatorListAction)
        warnings.push(
            `[${model.subject}.${model.object}] navigator is on but nothing lists — ` +
                `declare \`parent\` or set \`browser.navigator: false\``,
        );
    return warnings;
}
