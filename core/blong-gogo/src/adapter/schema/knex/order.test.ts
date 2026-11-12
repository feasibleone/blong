import tap from 'tap';
import {normalizeOrderBy, orderableTerms} from './order.ts';

tap.test('normalizeOrderBy reads the shape a portal sends', async t => {
    // The shape `useTableList` and the Explorer send. Knex reads `{column, order}`
    // and formats anything else as the literal `undefined`, which is a MySQL error
    // on every sorted column @@D-742.
    t.same(normalizeOrderBy([{field: 'coralName', dir: 'DESC'}]), [
        {column: 'coralName', order: 'desc'},
    ]);
});

tap.test('normalizeOrderBy reads the shape knex documents', async t => {
    t.same(normalizeOrderBy([{column: 'family.order', order: 'DESC'}]), [
        {column: 'family.order', order: 'desc'},
    ]);
});

tap.test('normalizeOrderBy keeps a bare column and knex shorthand', async t => {
    t.same(normalizeOrderBy('order'), [{column: 'order', order: 'asc'}]);
    t.same(normalizeOrderBy(['order desc']), [{column: 'order', order: 'desc'}]);
});

tap.test('normalizeOrderBy keeps the terms in the order given', async t => {
    t.same(normalizeOrderBy([{field: 'a', dir: 'asc'}, {column: 'b', order: 'desc'}, 'c']), [
        {column: 'a', order: 'asc'},
        {column: 'b', order: 'desc'},
        {column: 'c', order: 'asc'},
    ]);
});

tap.test('normalizeOrderBy drops what it cannot read', async t => {
    t.same(normalizeOrderBy(undefined), []);
    t.same(normalizeOrderBy(null), []);
    t.same(normalizeOrderBy(42), []);
    t.same(normalizeOrderBy([{}, {field: ''}, {dir: 'asc'}]), []);
});

tap.test('normalizeOrderBy falls back to ascending on an unknown direction', async t => {
    t.same(normalizeOrderBy([{field: 'x', dir: 'sideways'}]), [{column: 'x', order: 'asc'}]);
});

tap.test('orderableTerms keeps the columns the table has', async t => {
    t.same(orderableTerms(normalizeOrderBy([{field: 'targetKind', dir: 'ASC'}]), ['targetKind']), {
        terms: [{column: 'targetKind', order: 'asc'}],
        dropped: [],
    });
});

tap.test('orderableTerms keeps a label alias and a dotted name', async t => {
    const {terms, dropped} = orderableTerms(
        normalizeOrderBy([{field: 'legalName'}, {field: 'core_resource.resourceName'}]),
        ['organizationId'],
        {legalName: 'organization.legalName'},
    );
    t.same(
        terms.map(term => term.column),
        ['legalName', 'core_resource.resourceName'],
    );
    t.same(dropped, []);
});

tap.test('orderableTerms drops a name the table cannot order by', async t => {
    // `targetName` on an ACL rule is joined in for display, never stored: naming
    // it in the clause fails the read with `Unknown column ... in 'order clause'`.
    const {terms, dropped} = orderableTerms(
        normalizeOrderBy([{field: 'targetName', dir: 'ASC'}, {field: 'targetKind'}]),
        ['aclId', 'principalId', 'targetKind', 'effect', 'isActive'],
    );
    t.same(terms, [{column: 'targetKind', order: 'asc'}]);
    t.same(dropped, ['targetName']);
});
