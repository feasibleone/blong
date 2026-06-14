import {test} from 'tap';
import {withDefaults} from './defaults.js';

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
        t.equal(result.browser.permission.browse, 'finance.payment.browse');
        t.equal(result.browser.permission.add, 'finance.payment.add');
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

    t.end();
});
