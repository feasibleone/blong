import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    coral: type.Object({
        coralId: type.Optional(
            type.Union([type.Null(), type.Integer({readonly: true, default: 'auto-increment'})]),
        ),
        coralName: type.String(),
        familyId: type.Integer(),
        habitatId: type.Optional(type.Union([type.Null(), type.Integer()])),
        coralType: type.Optional(type.Union([type.Null(), type.String({maxLength: 10})])),
        maxDepth: type.Optional(type.Union([type.Null(), type.Integer()])),
        colorPattern: type.Optional(type.Union([type.Null(), type.String()])),
        conservationStatus: type.Optional(type.Union([type.Null(), type.String({maxLength: 2})])),
        isEndangered: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
        discoveryDate: type.Optional(type.Union([type.Null(), type.Date()])),
        coralDescription: type.Optional(type.Union([type.Null(), type.String()])),
        createdAt: type.Optional(type.Union([type.Null(), type.DateTime()])),
        createdBy: type.Optional(type.Union([type.Null(), type.Integer()])),
        updatedAt: type.Optional(type.Union([type.Null(), type.DateTime()])),
        updatedBy: type.Optional(type.Union([type.Null(), type.Integer()])),
        isActive: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
    }),
    family: type.Object({
        familyId: type.Optional(
            type.Union([type.Null(), type.Integer({readonly: true, default: 'auto-increment'})]),
        ),
        familyName: type.String(),
        parentFamilyId: type.Optional(type.Integer()),
        order: type.String(),
        class: type.String(),
        familyDescription: type.Optional(type.String()),
        createdAt: type.Optional(type.DateTime()),
        createdBy: type.Optional(type.Integer()),
        updatedAt: type.Optional(type.DateTime()),
        updatedBy: type.Optional(type.Integer()),
        isActive: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
    }),
    habitat: type.Object({
        habitatId: type.Optional(
            type.Union([type.Null(), type.Integer({readonly: true, default: 'auto-increment'})]),
        ),
        habitatName: type.String(),
        habitatType: type.String({maxLength: 20}),
        zone: type.String({maxLength: 20}),
        oceanZone: type.String({maxLength: 20}),
        region: type.String(),
        minDepth: type.Optional(type.Integer()),
        maxDepth: type.Optional(type.Integer()),
        waterTempMin: type.Optional(type.Integer()),
        waterTempMax: type.Optional(type.Integer()),
        latitude: type.Optional(type.Number()),
        longitude: type.Optional(type.Number()),
        protectionStatus: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
        habitatDescription: type.Optional(type.String()),
        createdAt: type.Optional(type.DateTime()),
        createdBy: type.Optional(type.Integer()),
        updatedAt: type.Optional(type.DateTime()),
        updatedBy: type.Optional(type.Integer()),
        isActive: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
    }),
    species: type.Object({
        speciesId: type.Optional(
            type.Union([type.Null(), type.Integer({readonly: true, default: 'auto-increment'})]),
        ),
        speciesName: type.String(),
        scientificName: type.String(),
        genus: type.String(),
        species: type.String(),
        familyId: type.Integer(),
        conservationStatus: type.String({maxLength: 2}),
        bodyLength: type.Optional(type.Number()),
        lifespan: type.Optional(type.Integer()),
        diet: type.Optional(type.String({maxLength: 20})),
        isEndangered: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
        speciesDescription: type.Optional(type.String()),
        createdAt: type.Optional(type.String({format: 'date-time'})),
        createdBy: type.Optional(type.Integer()),
        updatedAt: type.Optional(type.String({format: 'date-time'})),
        updatedBy: type.Optional(type.Integer()),
        isActive: type.Optional(
            type.Union([type.Null(), type.Boolean(), type.Literal(0), type.Literal(1)]),
        ),
    }),
}));
