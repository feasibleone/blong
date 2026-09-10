import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    item: type.Object({
        itemId: type.Integer({default: 'auto-increment'}),
        itemName: type.String(),
        itemActive: type.Optional(type.Boolean()),
    }),
    // Resource-backed entity: PK is a FK → core.resource.resourceId; the
    // display name is the virtual `personName` (stored in
    // core_resource.resourceName, NOT a table column).
    person: type.Object(
        {
            personId: type.uidNotNull(),
            personEmail: type.stringNotNull(),
            personDescription: type.stringNull(),
        },
        {
            constraints: {
                primaryKey: 'personId',
                foreign: {
                    personId: 'core.resource.resourceId',
                },
            },
        },
    ),
    // Resource-backed entity with a `hasMember` graph edge → person.
    team: type.Object(
        {
            teamId: type.uidNotNull(),
            teamDescription: type.stringNull(),
        },
        {
            constraints: {
                primaryKey: 'teamId',
                foreign: {
                    teamId: 'core.resource.resourceId',
                },
            },
        },
    ),
    // `type.ulid()` PK — the generic add generates a ULID server-side.
    ulidItem: type.Object({
        ulidId: type.ulid(),
        itemName: type.stringNotNull(),
    }),
    // `type.uuid()` PK — the generic add generates a UUID server-side.
    uuidItem: type.Object({
        uuidId: type.uuid(),
        itemName: type.stringNotNull(),
    }),
}));
