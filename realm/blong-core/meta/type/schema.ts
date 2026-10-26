import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    resource: type.Object(
        {
            resourceId: type.uuid(),
            resourceName: type.stringNotNull(),
            typeId: type.bigIntNotNull(),
        },
        {
            constraints: {
                foreign: {
                    typeId: 'core.type.typeId',
                },
                index: {
                    resourceName: {},
                },
            },
        },
    ),
    type: type.Object(
        {
            typeId: type.increment(),
            typeAlias: type.stringNotNull(),
        },
        {
            constraints: {
                unique: {
                    typeAlias: {},
                },
            },
        },
    ),
    property: type.Object(
        {
            resourceId: type.uidNotNull(),
            propertyName: type.stringNotNull(),
            propertyValue: type.stringNull(),
        },
        {
            constraints: {
                primaryKey: {columns: ['resourceId', 'propertyName']},
                foreign: {
                    resourceId: 'core.resource.resourceId',
                },
            },
        },
    ),
    triple: type.Object(
        {
            subjectId: type.uidNotNull(),
            predicateName: type.stringNotNull(),
            objectId: type.uidNotNull(),
        },
        {
            constraints: {
                primaryKey: {columns: ['subjectId', 'predicateName', 'objectId']},
                foreign: {
                    subjectId: 'core.resource.resourceId',
                    objectId: 'core.resource.resourceId',
                },
            },
        },
    ),
    translation: type.Object(
        {
            /** Surrogate key — the model system addresses a row by one column. */
            translationId: type.increment(),
            resourceId: type.uidNotNull(),
            languageCode: type.stringNotNull({maxLength: 10}),
            translatedName: type.stringNotNull(),
            /** Who last wrote the row; the seed may replace only its own rows. */
            editorId: type.uidNull(),
            editedAt: type.dateTimeNull(),
        },
        {
            constraints: {
                unique: {
                    resourceLanguage: {columns: ['resourceId', 'languageCode']},
                },
                foreign: {
                    resourceId: 'core.resource.resourceId',
                    editorId: 'core.resource.resourceId',
                },
            },
        },
    ),
    /**
     * UI label translations, keyed by the English string a component renders.
     *
     * Deliberately not resource-backed: a label is text, not an entity, and the
     * key must stay the English sentence so a missing translation degrades to
     * readable English (`D-624`, `D-625`). Empty `labelText` means "not
     * translated yet"; the seed merge never writes those (`D-631`).
     */
    label: type.Object(
        {
            labelId: type.increment(),
            labelKey: type.stringNotNull({maxLength: 255}),
            languageCode: type.stringNotNull({maxLength: 10}),
            labelText: type.stringNotNull(),
            editorId: type.uidNull(),
            editedAt: type.dateTimeNull(),
        },
        {
            constraints: {
                unique: {
                    keyLanguage: {columns: ['labelKey', 'languageCode']},
                },
                index: {
                    labelKey: {},
                    languageCode: {},
                },
                foreign: {
                    editorId: 'core.resource.resourceId',
                },
            },
        },
    ),
    path: type.Object(
        {
            originId: type.uidNotNull(),
            destinationId: type.uidNotNull(),
            pathType: type.stringNotNull(),
            pathDepth: type.integerNotNull(),
        },
        {
            constraints: {
                primaryKey: {columns: ['originId', 'destinationId', 'pathType']},
                foreign: {
                    originId: 'core.resource.resourceId',
                    destinationId: 'core.resource.resourceId',
                },
            },
        },
    ),
    /**
     * Named monotonic counters — the allocator's own memory.
     */
    counter: type.Object(
        {
            counterName: type.stringNotNull(),
            counterValue: type.integerNotNull(),
        },
        {
            constraints: {
                primaryKey: {columns: ['counterName']},
            },
        },
    ),
}));
