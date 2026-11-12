import {test} from 'tap';
import {modelWarnings, withDefaults} from './defaults.js';

test('withDefaults', t => {
    t.test('fills in keyField default', t => {
        const result = withDefaults({subject: 'user', object: 'user'});
        t.equal(result.keyField, 'userId');
        t.end();
    });

    t.test('fills in objectTitle from capitalized object', t => {
        const result = withDefaults({subject: 'product', object: 'product'});
        t.equal(result.objectTitle, 'Product');
        t.end();
    });

    t.test('uses provided objectTitle', t => {
        const result = withDefaults({
            subject: 'user',
            object: 'user',
            objectTitle: 'System User',
        });
        t.equal(result.objectTitle, 'System User');
        t.end();
    });

    t.test('uses provided keyField', t => {
        const result = withDefaults({
            subject: 'order',
            object: 'order',
            keyField: 'orderId',
        });
        t.equal(result.keyField, 'orderId');
        t.end();
    });

    t.test('generates default method names', t => {
        const result = withDefaults({subject: 'auth', object: 'user'});
        t.equal(result.methods.find, 'auth.user.find');
        t.equal(result.methods.add, 'auth.user.add');
        t.equal(result.methods.get, 'auth.user.get');
        t.equal(result.methods.edit, 'auth.user.edit');
        t.equal(result.methods.remove, 'auth.user.remove');
        t.end();
    });

    t.test('generates browser permission defaults', t => {
        const result = withDefaults({subject: 'finance', object: 'payment'});
        // The browse gate is the action the page calls, not a `.browse` name no
        // role is granted — the menubar filters entries on it.
        t.equal(result.browser.permission.browse, 'finance.payment.find');
        t.equal(result.browser.permission.add, 'finance.payment.add');
        t.equal(result.browser.permission.delete, 'finance.payment.remove');
        t.end();
    });

    t.test('uses provided methods overrides', t => {
        const result = withDefaults({
            subject: 'auth',
            object: 'user',
            methods: {find: 'custom.find.method'},
        });
        t.equal(result.methods.find, 'custom.find.method');
        t.equal(result.methods.add, 'auth.user.add'); // others still default
        t.end();
    });

    t.test('fills in browser configuration', t => {
        const result = withDefaults({subject: 'catalog', object: 'item'});
        t.ok(result.browser);
        t.ok(result.browser.title);
        t.ok(result.browser.icon);
        t.end();
    });

    // ── Navigator: derived from a declared parent ────────────────────────────

    t.test('has no navigator and no parent when none is declared', t => {
        const result = withDefaults({subject: 'catalog', object: 'item'});
        t.equal(result.browser.navigator, false);
        t.equal(result.parent, undefined);
        const browse = result.layouts.browse as {panels: unknown[]};
        t.equal(browse.panels.length, 2);
        t.end();
    });

    t.test('derives the navigator, the cascade and the tree from a parent', t => {
        const result = withDefaults({
            subject: 'sport',
            object: 'discipline',
            parent: {object: 'sport', field: 'sportId'},
        });
        t.equal(result.browser.navigator, true);
        const widget = result.schema.properties!.navigator!.widget!;
        t.equal(widget.listAction, 'sport.sport.find');
        t.equal(widget.keyField, 'sportId');
        t.equal(widget.labelField, 'sportName');
        t.equal(widget.type, 'navigator');
        // The table narrows to the selected node.
        t.same(result.schema.properties!.discipline!.widget!.master, {sportId: 'sportId'});
        // The parent rows are another table: no order is sent for them, because a
        // column named here may not exist there. The widget sorts what it gets.
        t.equal(widget.listParams, undefined);
        t.end();
    });

    t.test('accepts the parent object name as shorthand', t => {
        const result = withDefaults({subject: 'sport', object: 'discipline', parent: 'sport'});
        t.equal(result.parent!.object, 'sport');
        t.equal(result.parent!.field, 'sportId');
        t.equal(result.browser.navigator, true);
        t.end();
    });

    t.test('a self-tree navigates its own rows', t => {
        const result = withDefaults({
            subject: 'party',
            object: 'unit',
            nameField: 'unit.unitName',
            parent: {object: 'unit', field: 'parentUnitId'},
        });
        const widget = result.schema.properties!.navigator!.widget!;
        t.equal(widget.listAction, 'party.unit.find');
        t.equal(widget.keyField, 'unitId');
        t.equal(widget.labelField, 'unitName');
        // The field that names a node's parent is the declared one, so the
        // navigator renders the tree without a second declaration.
        t.equal(widget.parentField, 'parentUnitId');
        t.same(result.schema.properties!.unit!.widget!.master, {parentUnitId: 'unitId'});
        t.end();
    });

    t.test('a cross-object tree renders the parent rows as a tree', t => {
        const result = withDefaults({
            subject: 'party',
            object: 'contact',
            parent: {object: 'unit', field: 'unitId', parentField: 'parentUnitId'},
        });
        const widget = result.schema.properties!.navigator!.widget!;
        t.equal(widget.parentField, 'parentUnitId');
        t.equal(widget.labelField, 'unitName');
        t.end();
    });

    t.test('a flat parent is not a tree', t => {
        const result = withDefaults({subject: 'sport', object: 'discipline', parent: 'sport'});
        t.equal(result.schema.properties!.navigator!.widget!.parentField, undefined);
        t.end();
    });

    t.test('browser.navigator still overrides the derivation', t => {
        const off = withDefaults({
            subject: 'sport',
            object: 'discipline',
            parent: 'sport',
            browser: {navigator: false},
        });
        t.equal(off.browser.navigator, false);
        const on = withDefaults({subject: 'catalog', object: 'item', browser: {navigator: true}});
        t.equal(on.browser.navigator, true);
        t.end();
    });

    t.test('a navigator widget the model configured keeps its panel', t => {
        const result = withDefaults({
            subject: 'marine',
            object: 'coral',
            schema: {properties: {navigator: {widget: {listAction: 'marine.family.find'}}}},
        });
        t.equal(result.browser.navigator, true);
        t.equal(result.schema.properties!.navigator!.widget!.listAction, 'marine.family.find');
        t.end();
    });

    // ── Default sort ─────────────────────────────────────────────────────────

    t.test('orders a paged table by its declared name column', t => {
        const result = withDefaults({
            subject: 'sport',
            object: 'sport',
            nameField: 'sport.sportName',
        });
        const widget = result.schema.properties!.sport!.widget!;
        t.same(widget.listParams, {orderBy: [{field: 'sportName', dir: 'ASC'}]});
        t.same(result.browser.sort, {field: 'sportName', dir: 'ASC'});
        t.end();
    });

    t.test('a table whose name field is only the default is not ordered', t => {
        // `<object>Name` is a guess: the table may have no such column, and an
        // order the server cannot resolve fails the whole read.
        const result = withDefaults({subject: 'gateway', object: 'application'});
        t.equal(result.schema.properties!.application!.widget!.listParams, undefined);
        t.equal(result.browser.sort, false);
        t.ok(modelWarnings(result).some(w => /no sort could be determined/.test(w)));
        t.end();
    });

    t.test('a declared sort wins over the name column', t => {
        const result = withDefaults({
            subject: 'gateway',
            object: 'subscription',
            browser: {sort: {field: 'createdAt', dir: 'DESC'}},
        });
        t.same(result.schema.properties!.subscription!.widget!.listParams, {
            orderBy: [{field: 'createdAt', dir: 'DESC'}],
        });
        // The order is a column outside the default columns, so its header has to
        // be sortable for a reader to undo it.
        t.equal(result.schema.properties!.subscription!.properties!.createdAt!.sort, true);
        t.end();
    });

    t.test('a sort named as a string is ascending', t => {
        const result = withDefaults({subject: 'catalog', object: 'item', browser: {sort: 'code'}});
        t.same(result.browser.sort, {field: 'code', dir: 'ASC'});
        t.end();
    });

    t.test('sort: false leaves the table unordered and warns', t => {
        const result = withDefaults({
            subject: 'catalog',
            object: 'item',
            nameField: 'item.itemName',
            browser: {sort: false},
        });
        t.equal(result.schema.properties!.item!.widget!.listParams, undefined);
        t.equal(result.browser.sort, false);
        t.ok(modelWarnings(result).some(w => /no sort could be determined/.test(w)));
        t.end();
    });

    // ── Warnings ─────────────────────────────────────────────────────────────

    t.test('a resolved model with a navigator and a sort warns about nothing', t => {
        const result = withDefaults({
            subject: 'sport',
            object: 'discipline',
            nameField: 'discipline.disciplineName',
            parent: 'sport',
        });
        t.same(modelWarnings(result), []);
        t.end();
    });

    t.test('a navigator with nothing to list warns', t => {
        const result = withDefaults({
            subject: 'catalog',
            object: 'item',
            browser: {navigator: true},
        });
        t.ok(modelWarnings(result).some(w => /navigator is on but nothing lists/.test(w)));
        t.end();
    });

    t.end();
});
