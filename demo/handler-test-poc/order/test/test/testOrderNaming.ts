import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test: testOrderNaming
 *
 * Demonstrates the Unified Naming and Context feature from the
 * handler-test convergence design.
 *
 * **Approach 1 — Proxy Sub-Property Destructuring:**
 *   `orderOrderCreate: {singleItemOrder, bulkOrder}` produces aliased
 *   functions that call `orderOrderCreate` with `$meta.name` set to the
 *   camelCase→sentence conversion of the sub-property name.
 *
 * **Approach 2 — Annotation Syntax:**
 *   Mode A: `'@name premium order orderOrderCreate': premiumOrder` parses the
 *     annotation string and injects `$meta.name = 'premium order'`.
 *   Mode B: `'@priority orderOrderCreate': priorityOrder` looks up
 *     `config.handler.priority` and merges it into `$meta`.
 *     `'@cache ttl=5000 orderOrderCreate': cachedOrder` looks up
 *     `config.handler.cache`, then overrides `ttl` with `5000`.
 */
export default handler(
    ({
        handler: {
            testLoginTokenCreate,
            // Approach 1: Sub-property destructuring — camelCase name becomes sentence in $meta.name
            orderOrderCreate: {singleItemOrder, bulkOrder},
            orderOrderConfirm,
            // Approach 2 Mode A: Annotation syntax — explicit $meta injection
            '@name premium order orderOrderCreate': premiumOrder,
            '@name quick confirm @tag fast orderOrderConfirm': quickConfirm,
            // Approach 2 Mode B: Config-object reference (no params)
            '@priority orderOrderCreate': priorityOrder,
            // Approach 2 Mode B: Config-object reference with key=value overrides
            '@cache ttl=5000 orderOrderCreate': cachedOrder,
            // Mixed Mode A + Mode B
            '@name cached order @cache ttl=5000 orderOrderCreate': namedCachedOrder,
        },
    }) => ({
        testOrderNaming: (_params: {}, $meta: IMeta) => [
            testLoginTokenCreate({}, $meta),

            // Approach 1: singleItemOrder → $meta.name = 'single item order'
            async function singleItem(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;

                const result = (await singleItemOrder(
                    {
                        items: [{name: 'Widget', price: 50, quantity: 1}],
                        customerId: 'naming-1',
                    },
                    $meta,
                )) as {orderId: string; total: number; status: string};

                assert.ok(result.orderId, 'Single item order created');
                assert.equal(result.total, 50, 'Single item total');
                assert.equal(
                    $meta.name,
                    'single item order',
                    'Approach 1: $meta.name set to camelCase→sentence',
                );
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints propagated through alias');

                return result;
            },

            // Approach 1: bulkOrder → $meta.name = 'bulk order'
            async function bulk(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;

                const result = (await bulkOrder(
                    {
                        items: [
                            {name: 'Widget', price: 50, quantity: 10},
                            {name: 'Gadget', price: 25, quantity: 20},
                        ],
                        customerId: 'naming-2',
                    },
                    $meta,
                )) as {orderId: string; total: number; discountedTotal: number};

                assert.ok(result.orderId, 'Bulk order created');
                assert.equal(result.total, 1000, 'Bulk order total');
                assert.equal(result.discountedTotal, 900, 'Bulk discount applied');
                assert.equal(
                    $meta.name,
                    'bulk order',
                    'Approach 1: different alias → different $meta.name',
                );
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints propagated through alias');

                return result;
            },

            // Approach 2 Mode A: @name annotation → $meta.name = 'premium order'
            async function premium(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;

                const result = (await premiumOrder(
                    {
                        items: [{name: 'Premium Widget', price: 200, quantity: 1}],
                        customerId: 'naming-3',
                    },
                    $meta,
                )) as {orderId: string; total: number; status: string};

                assert.ok(result.orderId, 'Premium order created');
                assert.equal(result.total, 200, 'Premium order total');
                assert.equal(
                    $meta.name,
                    'premium order',
                    'Approach 2 Mode A: @name annotation injected into $meta',
                );
                assert.equal(
                    $meta.checkpoints.length,
                    3,
                    'Checkpoints propagated through annotation',
                );

                return result;
            },

            // Approach 2 Mode A: Multiple annotations — @name + @tag
            async function multiAnnotation(
                assert: typeof Assert,
                {premium, $meta}: {premium: Promise<{orderId: string}>; $meta: IMeta},
            ) {
                const order = await premium;
                $meta.checkpoints = [];
                delete $meta.name;
                delete ($meta as Record<string, unknown>).tag;

                const result = (await quickConfirm(
                    {orderId: order.orderId, paymentMethod: 'card'},
                    $meta,
                )) as {status: string};

                assert.equal(result.status, 'CONFIRMED', 'Quick confirm handler works');
                assert.equal(
                    $meta.name,
                    'quick confirm',
                    'Approach 2: @name from multiple annotations',
                );
                assert.equal(
                    ($meta as unknown as Record<string, string>).tag,
                    'fast',
                    'Approach 2: @tag from multiple annotations',
                );
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints propagated');

                return result;
            },

            // Verify direct handler call still works (no naming, no proxy interference)
            async function directCall(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;

                const result = (await orderOrderConfirm(
                    {orderId: 'test-direct', paymentMethod: 'bank'},
                    $meta,
                )) as {status: string};

                assert.equal(result.status, 'CONFIRMED', 'Direct call works');
                assert.equal($meta.name, undefined, 'Direct call: no name injection');
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints still work');

                return result;
            },

            // Approach 2 Mode B: @priority (no params) → merges config.handler.priority into $meta
            async function configPriority(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;
                const meta = $meta as unknown as Record<string, string> & IMeta;
                delete meta.level;
                delete meta.maxRetries;

                const result = (await priorityOrder(
                    {
                        items: [{name: 'Priority Widget', price: 100, quantity: 1}],
                        customerId: 'naming-mode-b-1',
                    },
                    $meta,
                )) as {orderId: string; total: number; status: string};

                assert.ok(result.orderId, 'Priority order created');
                assert.equal(result.total, 100, 'Priority order total');
                assert.equal(
                    meta.level,
                    'high',
                    'Mode B: config.handler.priority.level merged into $meta',
                );
                assert.equal(
                    meta.maxRetries,
                    '3',
                    'Mode B: config.handler.priority.maxRetries merged into $meta',
                );
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints propagated');

                return result;
            },

            // Approach 2 Mode B: @cache ttl=5000 → merges config.handler.cache, then overrides ttl
            async function configCacheOverride(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;
                const meta = $meta as unknown as Record<string, string> & IMeta;
                delete meta.ttl;
                delete meta.maxSize;

                const result = (await cachedOrder(
                    {
                        items: [{name: 'Cached Widget', price: 75, quantity: 2}],
                        customerId: 'naming-mode-b-2',
                    },
                    $meta,
                )) as {orderId: string; total: number; status: string};

                assert.ok(result.orderId, 'Cached order created');
                assert.equal(result.total, 150, 'Cached order total');
                assert.equal(
                    meta.ttl,
                    '5000',
                    'Mode B: key=value override supersedes config.handler.cache.ttl',
                );
                assert.equal(
                    meta.maxSize,
                    '1000',
                    'Mode B: config.handler.cache.maxSize preserved',
                );
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints propagated');

                return result;
            },

            // Mixed Mode A + Mode B: @name + @cache → $meta.name set, config merged with override
            async function mixedModeAB(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                $meta.checkpoints = [];
                delete $meta.name;
                const meta = $meta as unknown as Record<string, string> & IMeta;
                delete meta.ttl;
                delete meta.maxSize;

                const result = (await namedCachedOrder(
                    {
                        items: [{name: 'Named Cached Widget', price: 60, quantity: 3}],
                        customerId: 'naming-mode-b-3',
                    },
                    $meta,
                )) as {orderId: string; total: number; status: string};

                assert.ok(result.orderId, 'Named cached order created');
                assert.equal(result.total, 180, 'Named cached order total');
                assert.equal($meta.name, 'cached order', 'Mixed: Mode A @name injected into $meta');
                assert.equal(meta.ttl, '5000', 'Mixed: Mode B @cache ttl=5000 override applied');
                assert.equal(
                    meta.maxSize,
                    '1000',
                    'Mixed: Mode B config.handler.cache.maxSize preserved',
                );
                assert.equal($meta.checkpoints.length, 3, 'Checkpoints propagated');

                return result;
            },
        ],
    }),
);
