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
            resourceId: type.uidNotNull(),
            languageCode: type.stringNotNull({maxLength: 10}),
            translatedName: type.stringNotNull(),
        },
        {
            constraints: {
                primaryKey: {columns: ['resourceId', 'languageCode']},
                foreign: {
                    resourceId: 'core.resource.resourceId',
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
}));
