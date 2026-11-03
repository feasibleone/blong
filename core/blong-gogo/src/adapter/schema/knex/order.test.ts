import tap from 'tap';
import {normalizeOrderBy} from './order.ts';

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
