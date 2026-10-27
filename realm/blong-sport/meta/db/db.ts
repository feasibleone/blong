import {handler} from '@feasibleone/blong';

/**
 * meta/db/db.ts — `sport` schema/seed configuration.
 *
 * Orders start at 400 so every FK target (`core.*` = 1, `access.*` = 200+,
 * `party.*` = 300+) exists before the sport tables are created.
 *
 * Naming rule: a named object is resource-backed and its readable label is a
 * real column — `resource: {nameColumn: '<object>Name'}` — so
 * `core_resource.resourceName` mirrors it and every dropdown reads it. The five
 * profile tables share the party PK and are deliberately **not** resource-backed:
 * their resource is the person or organisation, created by the party realm.
 * @@D-595
 *
 * `meta/dbTest/*.yaml` loads in the dev and integration intents, where the adapter's
 * own `schema.dbTest` is on; an `upgrade` or `release` process must not dispatch those
 * seeds, because their handler groups are not loaded there.
 * No `mock` entries — every model is served by its real table.
 */
export default handler(() => ({
    config: {
        schema: {
            tables: {
                // Order is dependency order: a referenced table is created (and
                // its primary key applied) before the tables that point at it,
                // because the constraint pass walks the tables in this order.
                'sport.sport': {order: 410, resource: {nameColumn: 'sportName'}},
                'sport.discipline': {order: 411, resource: {nameColumn: 'disciplineName'}},
                'sport.category': {order: 412, resource: {nameColumn: 'categoryName'}},
                'sport.cycle': {order: 413, resource: {nameColumn: 'cycleName'}},
                'sport.area': {order: 414, resource: {nameColumn: 'areaName'}},
                'sport.document': {order: 415, resource: {nameColumn: 'documentTitle'}},
                'sport.award': {order: 416, resource: {nameColumn: 'awardName'}},

                'sport.federation': 420,
                'sport.club': 421,

                'sport.athlete': 430,
                'sport.coach': 431,
                'sport.specialist': 432,

                'sport.competition': {order: 440, resource: {nameColumn: 'competitionName'}},
                'sport.edition': 441,
                'sport.participation': 442,
                'sport.result': 443,

                'sport.campaign': 450,
                'sport.qualification': 451,

                'sport.attachment': 460,
                'sport.conferral': 461,

                'sport.coaching': 470,
                'sport.support': 471,
                'sport.affiliation': 472,
            },
        },
    },
}));
