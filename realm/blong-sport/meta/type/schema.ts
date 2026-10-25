import {schema} from '@feasibleone/blong';

/**
 * meta/type/schema.ts — `sport` table definitions.
 *
 * Three groups, and the identifier rule differs between them:
 *
 *  - **person and organisation profiles** (`athlete`, `coach`, `specialist`,
 *    `federation`, `club`) share the party PK: `athleteId` is a FK to
 *    `party.person.personId`, so one human is one `core.resource` no matter how
 *    many roles they hold. @@D-595 @@D-596
 *  - **named classifiers and records** (`sport`, `discipline`, `category`,
 *    `cycle`, `area`, `competition`, `document`, `award`) are resources: a
 *    `uuid()` PK with a FK to `core.resource.resourceId`, and the readable name
 *    lives in the `<object>Name` column that `meta/db/db.ts` points
 *    `resource: {nameColumn}` at.
 *  - **time-bound rows** (`edition`, `participation`, `result`, `qualification`,
 *    `campaign`, `attachment`, `conferral`, `coaching`, `support`,
 *    `affiliation`) are plain tables with a `ulid()` PK — not resources.
 *
 * Two words per column throughout (`athleteStatus`, `careerStartDate`), and the
 * identity column of a named object is `<object>Name`.
 *
 * Server-managed fields are nullable (`createdAt`), because the gateway
 * auto-validates CRUD params against the `NotNull` columns.
 *
 * The shared-PK profiles cannot be served by the generic CRUD (the PK is not a
 * resource PK and the person half lives in another table): `find`, `get`, `add`
 * and `edit` for those five tables are handlers over two library functions.
 *
 * @@D-599 documents stay generic; @@D-597 competition split; @@D-598 award and
 * conferral; @@D-605 campaign; @@D-606 qualification is one table (TBD).
 */
export default schema(async ({lib: {type}}) => ({
    // ── Person profiles: PK = FK to party.person.personId ────────────────────

    athlete: type.Object(
        {
            athleteId: type.uidNotNull(),
            athleteStatus: type.stringNotNull({maxLength: 20}),
            careerStartDate: type.dateNull(),
            careerEndDate: type.dateNull(),
            primarySportId: type.uidNull(),
            primaryDisciplineId: type.uidNull(),
            currentFederationId: type.uidNull(),
            currentClubId: type.uidNull(),
            athleteNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'athleteId',
                foreign: {
                    athleteId: 'party.person.personId',
                    primarySportId: 'sport.sport.sportId',
                    primaryDisciplineId: 'sport.discipline.disciplineId',
                    currentFederationId: 'sport.federation.federationId',
                    currentClubId: 'sport.club.clubId',
                },
            },
        },
    ),

    coach: type.Object(
        {
            coachId: type.uidNotNull(),
            coachStatus: type.stringNotNull({maxLength: 20}),
            careerStartDate: type.dateNull(),
            certificationNumber: type.stringNull({maxLength: 60}),
            certificationStatus: type.stringNull({maxLength: 20}),
            certificationValidUntil: type.dateNull(),
            primarySportId: type.uidNull(),
            currentFederationId: type.uidNull(),
            coachNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'coachId',
                foreign: {
                    coachId: 'party.person.personId',
                    primarySportId: 'sport.sport.sportId',
                    currentFederationId: 'sport.federation.federationId',
                },
            },
        },
    ),

    specialist: type.Object(
        {
            specialistId: type.uidNotNull(),
            specialistStatus: type.stringNotNull({maxLength: 20}),
            expertAreaId: type.uidNotNull(),
            specialtyName: type.stringNull({maxLength: 100}),
            qualificationLevel: type.stringNull({maxLength: 30}),
            certificationNumber: type.stringNull({maxLength: 60}),
            certificationStatus: type.stringNull({maxLength: 20}),
            certificationValidUntil: type.dateNull(),
            careerStartDate: type.dateNull(),
            specialistNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'specialistId',
                foreign: {
                    specialistId: 'party.person.personId',
                    expertAreaId: 'sport.area.areaId',
                },
            },
        },
    ),

    // ── Organisation profiles: PK = FK to party.organization.organizationId ──

    federation: type.Object(
        {
            federationId: type.uidNotNull(),
            federationShortName: type.stringNull({maxLength: 30}),
            sportId: type.uidNotNull(),
            federationStatus: type.stringNotNull({maxLength: 20}),
            registerIdentifier: type.stringNull({maxLength: 60}),
            registerSource: type.stringNull({maxLength: 100}),
            federationNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'federationId',
                foreign: {
                    federationId: 'party.organization.organizationId',
                    sportId: 'sport.sport.sportId',
                },
            },
        },
    ),

    club: type.Object(
        {
            clubId: type.uidNotNull(),
            clubShortName: type.stringNull({maxLength: 30}),
            sportId: type.uidNull(),
            clubStatus: type.stringNotNull({maxLength: 20}),
            registerIdentifier: type.stringNull({maxLength: 60}),
            clubNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'clubId',
                foreign: {
                    clubId: 'party.organization.organizationId',
                    sportId: 'sport.sport.sportId',
                },
            },
        },
    ),

    // ── Classifiers (resources) ──────────────────────────────────────────────

    sport: type.Object(
        {
            sportId: type.uuid(),
            sportName: type.stringNotNull({maxLength: 100}),
            sportIntlName: type.stringNull({maxLength: 100}),
            sportCode: type.stringNull({maxLength: 20}),
            sportKind: type.stringNotNull({maxLength: 20}),
            sportStatus: type.stringNotNull({maxLength: 20}),
            inclusionDate: type.dateNull(),
            sourceName: type.stringNull({maxLength: 100}),
        },
        {
            constraints: {
                primaryKey: 'sportId',
                foreign: {sportId: 'core.resource.resourceId'},
            },
        },
    ),

    discipline: type.Object(
        {
            disciplineId: type.uuid(),
            disciplineName: type.stringNotNull({maxLength: 100}),
            disciplineIntlName: type.stringNull({maxLength: 100}),
            disciplineCode: type.stringNull({maxLength: 20}),
            disciplineKind: type.stringNotNull({maxLength: 20}),
            disciplineStatus: type.stringNotNull({maxLength: 20}),
            inclusionDate: type.dateNull(),
            sportId: type.uidNotNull(),
            sourceName: type.stringNull({maxLength: 100}),
        },
        {
            constraints: {
                primaryKey: 'disciplineId',
                foreign: {
                    disciplineId: 'core.resource.resourceId',
                    sportId: 'sport.sport.sportId',
                },
            },
        },
    ),

    category: type.Object(
        {
            categoryId: type.uuid(),
            categoryName: type.stringNotNull({maxLength: 100}),
            categoryKind: type.stringNotNull({maxLength: 20}),
            categoryStatus: type.stringNotNull({maxLength: 20}),
            sportId: type.uidNotNull(),
            disciplineId: type.uidNull(),
            sourceName: type.stringNull({maxLength: 100}),
        },
        {
            constraints: {
                primaryKey: 'categoryId',
                foreign: {
                    categoryId: 'core.resource.resourceId',
                    sportId: 'sport.sport.sportId',
                    disciplineId: 'sport.discipline.disciplineId',
                },
            },
        },
    ),

    cycle: type.Object(
        {
            cycleId: type.uuid(),
            cycleName: type.stringNotNull({maxLength: 100}),
            cycleStartYear: type.integerNotNull(),
            cycleEndYear: type.integerNotNull(),
            gamesName: type.stringNull({maxLength: 100}),
            cycleStatus: type.stringNotNull({maxLength: 20}),
            sourceName: type.stringNull({maxLength: 100}),
        },
        {
            constraints: {
                primaryKey: 'cycleId',
                foreign: {cycleId: 'core.resource.resourceId'},
            },
        },
    ),

    area: type.Object(
        {
            areaId: type.uuid(),
            areaName: type.stringNotNull({maxLength: 100}),
            areaStatus: type.stringNotNull({maxLength: 20}),
        },
        {
            constraints: {
                primaryKey: 'areaId',
                foreign: {areaId: 'core.resource.resourceId'},
            },
        },
    ),

    // ── Competition: the series (resource) and its editions (time-bound) ─────

    competition: type.Object(
        {
            competitionId: type.uuid(),
            competitionName: type.stringNotNull({maxLength: 100}),
            competitionIntlName: type.stringNull({maxLength: 100}),
            competitionKind: type.stringNotNull({maxLength: 30}),
            competitionStatus: type.stringNotNull({maxLength: 20}),
            sportId: type.uidNotNull(),
            disciplineId: type.uidNull(),
            organiserPartyId: type.uidNull(),
            federationId: type.uidNull(),
            sourceName: type.stringNull({maxLength: 100}),
        },
        {
            constraints: {
                primaryKey: 'competitionId',
                foreign: {
                    competitionId: 'core.resource.resourceId',
                    sportId: 'sport.sport.sportId',
                    disciplineId: 'sport.discipline.disciplineId',
                    organiserPartyId: 'party.organization.organizationId',
                    federationId: 'sport.federation.federationId',
                },
            },
        },
    ),

    edition: type.Object(
        {
            editionId: type.ulid(),
            competitionId: type.uidNotNull(),
            editionName: type.stringNotNull({maxLength: 100}),
            editionYear: type.integerNotNull(),
            startDate: type.dateNull(),
            endDate: type.dateNull(),
            hostCountryName: type.stringNull({maxLength: 100}),
            hostCityName: type.stringNull({maxLength: 100}),
            venueName: type.stringNull({maxLength: 100}),
            editionStatus: type.stringNotNull({maxLength: 20}),
            officialName: type.stringNull({maxLength: 150}),
            sourceDocumentId: type.uidNull(),
            editionNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                foreign: {
                    competitionId: 'sport.competition.competitionId',
                    sourceDocumentId: 'sport.document.documentId',
                },
                index: {competitionId: {}},
            },
        },
    ),

    // ── Participation and result ─────────────────────────────────────────────

    participation: type.Object(
        {
            participationId: type.ulid(),
            editionId: type.uidNotNull(),
            athleteId: type.uidNotNull(),
            sportId: type.uidNotNull(),
            disciplineId: type.uidNull(),
            categoryId: type.uidNull(),
            participationFormat: type.stringNotNull({maxLength: 20}),
            participationStatus: type.stringNotNull({maxLength: 20}),
            teamName: type.stringNull({maxLength: 100}),
            partnerName: type.stringNull({maxLength: 100}),
            participationNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                foreign: {
                    editionId: 'sport.edition.editionId',
                    athleteId: 'sport.athlete.athleteId',
                    sportId: 'sport.sport.sportId',
                    disciplineId: 'sport.discipline.disciplineId',
                    categoryId: 'sport.category.categoryId',
                },
                index: {editionId: {}, athleteId: {}},
            },
        },
    ),

    result: type.Object(
        {
            resultId: type.ulid(),
            participationId: type.uidNotNull(),
            disciplineId: type.uidNull(),
            resultKind: type.stringNotNull({maxLength: 20}),
            resultValue: type.stringNull({maxLength: 100}),
            resultUnit: type.stringNull({maxLength: 20}),
            rankingPlace: type.integerNull(),
            medalKind: type.stringNull({maxLength: 20}),
            resultStatus: type.stringNotNull({maxLength: 20}),
            resultDate: type.dateNull(),
            sourceDocumentId: type.uidNull(),
            previousResultId: type.uidNull(),
            resultNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                foreign: {
                    participationId: 'sport.participation.participationId',
                    disciplineId: 'sport.discipline.disciplineId',
                    sourceDocumentId: 'sport.document.documentId',
                    previousResultId: 'sport.result.resultId',
                },
                index: {participationId: {}},
            },
        },
    ),

    // ── Olympic records ──────────────────────────────────────────────────────

    campaign: type.Object(
        {
            campaignId: type.ulid(),
            athleteId: type.uidNotNull(),
            cycleId: type.uidNotNull(),
            olympicStatus: type.stringNotNull({maxLength: 30}),
            programmeParticipation: type.booleanNull(),
            olympicRanking: type.integerNull(),
            olympicResult: type.stringNull({maxLength: 100}),
            ratingPosition: type.integerNull(),
            ratingOrganisationName: type.stringNull({maxLength: 100}),
            ratingDate: type.dateNull(),
            campaignNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                foreign: {
                    athleteId: 'sport.athlete.athleteId',
                    cycleId: 'sport.cycle.cycleId',
                },
                index: {athleteId: {}, cycleId: {}},
            },
        },
    ),

    qualification: type.Object(
        {
            qualificationId: type.ulid(),
            athleteId: type.uidNotNull(),
            cycleId: type.uidNotNull(),
            editionId: type.uidNull(),
            sportId: type.uidNotNull(),
            disciplineId: type.uidNull(),
            categoryId: type.uidNull(),
            qualificationKind: type.stringNotNull({maxLength: 30}),
            qualificationStatus: type.stringNotNull({maxLength: 20}),
            acquiredDate: type.dateNull(),
            validUntilDate: type.dateNull(),
            quotaKind: type.stringNull({maxLength: 20}),
            quotaRecipientKind: type.stringNull({maxLength: 20}),
            quotaConfirmedDate: type.dateNull(),
            basisNote: type.stringNull({maxLength: 500}),
            decisionDocumentId: type.uidNull(),
        },
        {
            constraints: {
                foreign: {
                    athleteId: 'sport.athlete.athleteId',
                    cycleId: 'sport.cycle.cycleId',
                    editionId: 'sport.edition.editionId',
                    sportId: 'sport.sport.sportId',
                    disciplineId: 'sport.discipline.disciplineId',
                    categoryId: 'sport.category.categoryId',
                    decisionDocumentId: 'sport.document.documentId',
                },
                index: {athleteId: {}, cycleId: {}},
            },
        },
    ),

    // ── Records: generic document tables (D-599) ─────────────────────────────

    document: type.Object(
        {
            documentId: type.uuid(),
            documentTitle: type.stringNotNull({maxLength: 150}),
            documentNumber: type.stringNull({maxLength: 60}),
            documentType: type.stringNull({maxLength: 40}),
            issueDate: type.dateNull(),
            validUntilDate: type.dateNull(),
            issuerName: type.stringNull({maxLength: 100}),
            issuerPartyId: type.uidNull(),
            documentStatus: type.stringNotNull({maxLength: 20}),
            documentFormat: type.stringNull({maxLength: 20}),
            sourceName: type.stringNull({maxLength: 100}),
            referenceUrl: type.stringNull({maxLength: 255}),
            checksumValue: type.stringNull({maxLength: 64}),
            documentNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'documentId',
                foreign: {
                    documentId: 'core.resource.resourceId',
                    issuerPartyId: 'party.organization.organizationId',
                },
            },
        },
    ),

    attachment: type.Object(
        {
            attachmentId: type.ulid(),
            documentId: type.uidNotNull(),
            targetResourceId: type.uidNotNull(),
            attachmentRole: type.stringNull({maxLength: 30}),
            attachmentNote: type.stringNull({maxLength: 500}),
            attachedDate: type.dateNull(),
        },
        {
            constraints: {
                foreign: {
                    documentId: 'sport.document.documentId',
                    targetResourceId: 'core.resource.resourceId',
                },
                index: {documentId: {}, targetResourceId: {}},
            },
        },
    ),

    award: type.Object(
        {
            awardId: type.uuid(),
            awardName: type.stringNotNull({maxLength: 150}),
            awardCategory: type.stringNotNull({maxLength: 20}),
            awardLevel: type.stringNull({maxLength: 30}),
            conferringPartyId: type.uidNull(),
            awardStatus: type.stringNotNull({maxLength: 20}),
            awardNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                primaryKey: 'awardId',
                foreign: {
                    awardId: 'core.resource.resourceId',
                    conferringPartyId: 'party.organization.organizationId',
                },
            },
        },
    ),

    conferral: type.Object(
        {
            conferralId: type.ulid(),
            awardId: type.uidNotNull(),
            recipientResourceId: type.uidNotNull(),
            // Derived, never submitted: `sportConferralAdd`/`.edit` read the kind
            // from `core_resource` and write it over the payload, and the form
            // shows it read-only. A not-null column would make the browser's own
            // validation demand a value the operator cannot type. @@D-598
            recipientKind: type.stringNull({maxLength: 20}),
            conferralDate: type.dateNull(),
            conferringPartyId: type.uidNull(),
            documentId: type.uidNull(),
            conferralStatus: type.stringNotNull({maxLength: 20}),
            basisNote: type.stringNull({maxLength: 500}),
            conferralNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                foreign: {
                    awardId: 'sport.award.awardId',
                    recipientResourceId: 'core.resource.resourceId',
                    conferringPartyId: 'party.organization.organizationId',
                    documentId: 'sport.document.documentId',
                },
                index: {awardId: {}, recipientResourceId: {}},
            },
        },
    ),

    // ── Relationship periods (time-bound, not resources — D-600) ─────────────

    coaching: type.Object(
        {
            coachingId: type.ulid(),
            athleteId: type.uidNotNull(),
            coachId: type.uidNotNull(),
            sportId: type.uidNotNull(),
            disciplineId: type.uidNull(),
            cycleId: type.uidNull(),
            fromDate: type.dateNull(),
            toDate: type.dateNull(),
            coachRole: type.stringNotNull({maxLength: 20}),
            linkStatus: type.stringNotNull({maxLength: 20}),
            basisNote: type.stringNull({maxLength: 500}),
            sourceDocumentId: type.uidNull(),
        },
        {
            constraints: {
                foreign: {
                    athleteId: 'sport.athlete.athleteId',
                    coachId: 'sport.coach.coachId',
                    sportId: 'sport.sport.sportId',
                    disciplineId: 'sport.discipline.disciplineId',
                    cycleId: 'sport.cycle.cycleId',
                    sourceDocumentId: 'sport.document.documentId',
                },
                index: {athleteId: {}, coachId: {}},
            },
        },
    ),

    support: type.Object(
        {
            supportId: type.ulid(),
            athleteId: type.uidNotNull(),
            specialistId: type.uidNotNull(),
            sportId: type.uidNotNull(),
            cycleId: type.uidNull(),
            fromDate: type.dateNull(),
            toDate: type.dateNull(),
            expertRole: type.stringNotNull({maxLength: 20}),
            linkStatus: type.stringNotNull({maxLength: 20}),
            basisNote: type.stringNull({maxLength: 500}),
            sourceDocumentId: type.uidNull(),
        },
        {
            constraints: {
                foreign: {
                    athleteId: 'sport.athlete.athleteId',
                    specialistId: 'sport.specialist.specialistId',
                    sportId: 'sport.sport.sportId',
                    cycleId: 'sport.cycle.cycleId',
                    sourceDocumentId: 'sport.document.documentId',
                },
                index: {athleteId: {}, specialistId: {}},
            },
        },
    ),

    affiliation: type.Object(
        {
            affiliationId: type.ulid(),
            personResourceId: type.uidNotNull(),
            organisationId: type.uidNotNull(),
            affiliationKind: type.stringNotNull({maxLength: 20}),
            fromDate: type.dateNull(),
            toDate: type.dateNull(),
            affiliationStatus: type.stringNotNull({maxLength: 20}),
            basisNote: type.stringNull({maxLength: 500}),
        },
        {
            constraints: {
                foreign: {
                    personResourceId: 'core.resource.resourceId',
                    organisationId: 'party.organization.organizationId',
                },
                index: {personResourceId: {}, organisationId: {}},
            },
        },
    ),
}));
