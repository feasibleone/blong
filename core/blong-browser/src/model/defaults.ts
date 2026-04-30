/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 */
import type {IModelSpec, IResolvedModelSpec} from '@feasibleone/blong';

/** Capitalize the first character of a string */
function capital(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Core logic to merge two types (T is target, U is source/override)
type DeepMerge<T, U> = T extends object
    ? U extends object
        ? {
              [K in keyof T | keyof U]: K extends keyof T
                  ? K extends keyof U
                      ? DeepMerge<T[K], U[K]> // Recursively merge shared keys
                      : T[K]
                  : K extends keyof U
                    ? U[K]
                    : never;
          }
        : U
    : U;

// Variadic type to process N arguments
type DeepMergeAll<Ts extends readonly unknown[]> = Ts extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly []
        ? Head
        : DeepMerge<Head, DeepMergeAll<Tail>>
    : unknown;

/**
 * Merge source into target deeply, returning a new object.
 * Only plain objects are merged; arrays and primitives are overwritten.
 */
export function deepMerge<T extends object[]>(...args: T): DeepMergeAll<T> {
    const [target, ...sources] = args;
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
    return target as DeepMergeAll<T>;
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

    return deepMerge<[IResolvedModelSpec, IModelSpec]>(
        {
            subject,
            object,
            objectTitle,
            keyField,
            nameField,
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
                    },
                },
            },
            cards: {
                edit: {
                    label: objectTitle,
                    widgets: [nameField],
                },
                browse: {
                    widgets: [nameField],
                },
                hidden: {
                    hidden: true,
                    label: 'Hidden fields',
                    widgets: [`${object}.${keyField}`],
                },
            },
            browser: {
                title: `${objectTitle} List`,
                icon: 'pi pi-list',
                permission: {
                    browse: `${subject}.${object}.browse`,
                    add: `${subject}.${object}.add`,
                    edit: `${subject}.${object}.edit`,
                    delete: `${subject}.${object}.remove`,
                },
                resultSet: object,
                create: [{title: 'Create'}],
                toolbar: [],
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
                edit: ['edit', 'hidden'],
            },
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
