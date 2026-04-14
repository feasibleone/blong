/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 */
import type {IModelSpec, IResolvedModelSpec} from '@feasibleone/blong';

/** Capitalise the first character of a string */
function capital(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Merge source into target deeply, returning a new object.
 * Only plain objects are merged; arrays and primitives are overwritten.
 */
export function deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T {
    for (const source of sources) {
        if (!source) continue;
        for (const [key, value] of Object.entries(source)) {
            const dest = (target as Record<string, unknown>)[key];
            if (
                value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                dest !== null &&
                typeof dest === 'object' &&
                !Array.isArray(dest)
            ) {
                (target as Record<string, unknown>)[key] = deepMerge(
                    {...dest} as object,
                    value as object,
                );
            } else {
                (target as Record<string, unknown>)[key] = value;
            }
        }
    }
    return target;
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

    const defaultSchemaOverlay = {
        properties: {
            [object]: {
                properties: {
                    [keyField]: {},
                    [nameField.split('.').pop()!]: {
                        title: `${objectTitle} Name`,
                        filter: true,
                        sort: true,
                    },
                },
            },
        },
    };

    const defaultCards = {
        edit: {
            label: objectTitle,
            widgets: [nameField],
        },
        hidden: {
            hidden: true,
            label: 'Hidden fields',
            widgets: [`${object}.${keyField}`],
        },
    };

    const defaultBrowserPermissions = {
        browse: `${subject}.${object}.browse`,
        add: `${subject}.${object}.add`,
        edit: `${subject}.${object}.edit`,
        delete: `${subject}.${object}.remove`,
    };

    const defaultBrowser = {
        title: `${objectTitle} List`,
        icon: 'pi pi-list',
        permission: defaultBrowserPermissions,
        resultSet: object,
        create: [{title: 'Create'}],
        toolbar: [],
    };

    const defaultEditor = {
        resultSet: object,
    };

    const defaultReport = {
        title: `${objectTitle} Report`,
        permission: `${subject}.${object}.report`,
    };

    const defaultMethods: Required<IModelSpec['methods'] & object> = {
        find: `${subject}.${object}.find`,
        get: `${subject}.${object}.get`,
        add: `${subject}.${object}.add`,
        edit: `${subject}.${object}.edit`,
        remove: `${subject}.${object}.remove`,
        report: `${subject}.${object}.report`,
    };

    const defaultLayouts = {
        edit: ['hidden', 'edit'],
    };

    return {
        subject,
        object,
        objectTitle,
        keyField,
        nameField,
        schema: deepMerge(
            {} as IModelSpec['schema'] & object,
            defaultSchemaOverlay,
            (spec.schema as object) ?? {},
        ),
        cards: deepMerge({} as NonNullable<IModelSpec['cards']>, defaultCards, spec.cards ?? {}),
        browser: deepMerge(
            {} as Required<IModelSpec['browser']> & {permission: typeof defaultBrowserPermissions},
            defaultBrowser,
            spec.browser ?? {},
        ) as IResolvedModelSpec['browser'],
        editor: deepMerge({} as Required<IModelSpec['editor']>, defaultEditor, spec.editor ?? {}),
        report: deepMerge({} as Required<IModelSpec['report']>, defaultReport, spec.report ?? {}),
        layouts: deepMerge(
            {} as NonNullable<IModelSpec['layouts']>,
            defaultLayouts,
            spec.layouts ?? {},
        ),
        methods: deepMerge(
            {} as Required<IModelSpec['methods']>,
            defaultMethods,
            spec.methods ?? {},
        ),
    } as IResolvedModelSpec;
}
