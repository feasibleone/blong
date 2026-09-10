import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    /**
     * Person profiles attached to core.resource records.
     *
     * The PK `personId` is a UUID FK to core.resource.resourceId, so every person
     * corresponds to a resource entity.  The `type.uuid()` default triggers
     * auto-generation of a binary UUID in the knex `add` handler, which also
     * creates the corresponding `core_resource` row.
     */
    person: type.Object(
        {
            personId: type.uuid(),
            firstName: type.stringNotNull(),
            middleName: type.stringNull(),
            lastName: type.stringNotNull(),
            birthDate: type.dateNull(),
            gender: type.stringNull({maxLength: 10}),
            maritalStatus: type.stringNull({maxLength: 20}),
            nationality: type.stringNull({maxLength: 100}),
            occupation: type.stringNull(),
            notes: type.stringNull(),
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

    /**
     * Organization profiles attached to core.resource records.
     *
     * Organizations are legal entities such as companies, banks, NGOs.
     * The PK `organizationId` is a UUID FK to core.resource.resourceId.
     */
    organization: type.Object(
        {
            organizationId: type.uuid(),
            legalName: type.stringNotNull(),
            tradingName: type.stringNull(),
            registrationNumber: type.stringNull(),
            taxId: type.stringNull(),
            establishedDate: type.dateNull(),
            industry: type.stringNull(),
            website: type.stringNull(),
            notes: type.stringNull(),
        },
        {
            constraints: {
                primaryKey: 'organizationId',
                foreign: {
                    organizationId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Organizational units — departments, branches, divisions, and teams.
     *
     * The PK `unitId` is a UUID FK to core.resource.resourceId. Hierarchy
     * relationships (unit → organization, child → parent unit) are
     * stored in core.triple with predicates "belongsTo" and "isPartOf".
     */
    unit: type.Object(
        {
            unitId: type.uuid(),
            unitName: type.stringNotNull(),
            unitType: type.stringNull({maxLength: 20}),
            notes: type.stringNull(),
        },
        {
            constraints: {
                primaryKey: 'unitId',
                foreign: {
                    unitId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Contact details — email addresses, phone numbers, etc.
     *
     * Linked to any party resource (person, organization, unit) via
     * `partyResourceId` → core.resource.resourceId.
     */
    contact: type.Object(
        {
            partyContactId: type.increment(),
            partyResourceId: type.uidNotNull(),
            contactType: type.stringNotNull({maxLength: 20}),
            contactValue: type.stringNotNull(),
            isPrimary: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    partyResourceId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Addresses — physical locations for persons and organizations.
     *
     * Linked via `partyResourceId`. Supports multiple address types (home,
     * work, billing, shipping) per party.
     */
    address: type.Object(
        {
            partyAddressId: type.increment(),
            partyResourceId: type.uidNotNull(),
            addressType: type.stringNull({maxLength: 20}),
            streetAddress: type.stringNull(),
            city: type.stringNull(),
            stateProvince: type.stringNull(),
            postalCode: type.stringNull(),
            countryId: type.uidNull(),
            isPrimary: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    partyResourceId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Identifiers — government-issued or official IDs for persons and organizations.
     *
     * Linked via `partyResourceId`. Examples: passport, national ID, tax ID,
     * drivers license, social security number, business registration.
     */
    identifier: type.Object(
        {
            partyIdentifierId: type.increment(),
            partyResourceId: type.uidNotNull(),
            identifierType: type.stringNotNull({maxLength: 30}),
            identifierValue: type.stringNotNull(),
            issuingAuthority: type.stringNull(),
            issuedDate: type.dateNull(),
            expiryDate: type.dateNull(),
        },
        {
            constraints: {
                foreign: {
                    partyResourceId: 'core.resource.resourceId',
                },
            },
        },
    ),
}));
