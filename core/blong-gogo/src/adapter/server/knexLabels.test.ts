import type {IObjectSchema} from '@feasibleone/blong/types';
import KnexLib from 'knex';
import tap from 'tap';
import {attachLabelJoins} from './knex.ts';

/**
 * A club whose Legal Name lives in `party_organization`.
 *
 * The shape is the one `realm/blong-sport` declares: the profile row carries the
 * key, the party row carries the name, and the label is read through the join.
 */
const schema = {
    sport: {
        club: {
            properties: {organizationId: {}, clubShortName: {}},
            constraints: {foreign: {organizationId: 'party.organization.organizationId'}},
        },
    },
    party: {organization: {properties: {legalName: {}}}},
} as unknown as IObjectSchema;

/**
 * `1` is how a table says "take the definition from the realm schema" — without
 * it `resolveTableSpec` has no table config and answers nothing at all.
 */
const config = {
    schema: {
        tables: {
            'sport.club': 1,
            'party.organization': {dropdown: {labelColumn: 'legalName'}},
        },
    },
};

/** The join is planned, never run: knex builds the SQL without a connection. */
function attach(labels: unknown) {
    const knex = KnexLib({client: 'mysql2'});
    return attachLabelJoins(
        knex('sport_club') as never,
        knex.raw as never,
        schema,
        config as never,
        'sport',
        'club',
        'sport_club',
        labels,
    );
}

tap.test('attachLabelJoins reports the alias a label is filtered through', async t => {
    // A label is `<fk minus Id>Name`: the club's `organizationId` is displayed as
    // `organizationName`, read from the target's own label column.
    const {selections, aliases} = attach(['organizationName']);
    // The projection the row is read under …
    t.same(selections, ['label_organizationId.legalName as organizationName']);
    // … and the name a `where` has to use for the same column (`@@D-743`).
    t.same(aliases, {organizationName: 'label_organizationId.legalName'});
});

tap.test('attachLabelJoins leaves an unjoined read with no aliases', async t => {
    const {selections, aliases} = attach(undefined);
    t.same(selections, []);
    t.same(aliases, {});
});

tap.test('attachLabelJoins ignores a label the table declares no key for', async t => {
    const {aliases} = attach(['nothingName']);
    t.same(aliases, {});
});
