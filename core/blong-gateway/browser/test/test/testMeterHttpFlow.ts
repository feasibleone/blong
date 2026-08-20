import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Extract the HTTP status code from an error thrown by the handler proxy
 * (JSON-RPC codec or MLE errorReceive path).
 */
function getHttpStatus(err: unknown): number | undefined {
    const e = err as Record<string, unknown>;
    return (
        ((e.res as Record<string, unknown>)?.statusCode as number | undefined) ??
        (e.statusCode as number | undefined) ??
        ((e.params as Record<string, unknown>)?.code as number | undefined)
    );
}

/**
 * Gateway meter HTTP flow — the real-setup (no-mock) proof that the
 * ApiGateway Fastify plugin is wired into the gateway.
 *
 * Every step runs over real HTTP (browser backend adapter → MLE codec → the
 * server-side gateway) against real MySQL + Redis: the developer registers two
 * unique OAuth applications (the monthly credit bucket is shared per
 * application across bundles, so the rate fixture and the credit fixture each
 * need their own app), merges the dev-only `meterprobe` fixture bundles,
 * subscribes, and mints `client_credentials` tokens. The plugin-only 429s
 * (rate / credits) prove the preHandler is on the request path — a plain
 * authorization failure would be a 403, never a 429.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            gatewayApplicationRegister,
            gatewayBundleMerge,
            gatewaySubscriptionMerge,
            meterprobeRate,
            meterprobeCredit,
            visionCompute,
        },
    }) => ({
        testMeterHttpFlow: ({name = 'gateway meter http flow'}: {name?: string} = {}) =>
            group(name)([
                // Log in as the seeded developer (testUser) to own the apps.
                async function loginDeveloper(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        token_type: string;
                        access_token: string;
                    }>({username: 'testUser', password: 'testPassword'}, $meta);
                    assert.equal(result.token_type, 'Bearer', 'Developer token type is Bearer');
                    return result;
                },

                // Register two unique OAuth applications: a fresh clientId yields
                // a fresh crockford application id → fresh Redis keys (deterministic,
                // no metering-state reset needed between runs).
                async function registerApps(
                    assert: IAssert,
                    {
                        $meta,
                        loginDeveloper,
                    }: {
                        $meta: IMeta;
                        loginDeveloper: Awaited<{access_token: string}>;
                    },
                ) {
                    const suffix = Date.now();
                    const rateClientId = `http-rate-${suffix}`;
                    const creditClientId = `http-credit-${suffix}`;
                    const rateApp = await gatewayApplicationRegister<{
                        applicationId: string;
                        clientId: string;
                        clientSecret: string;
                    }>({clientId: rateClientId}, $meta);
                    const creditApp = await gatewayApplicationRegister<{
                        applicationId: string;
                        clientId: string;
                        clientSecret: string;
                    }>({clientId: creditClientId}, $meta);
                    assert.equal(rateApp.clientId, rateClientId, 'Rate client id registered');
                    assert.equal(
                        creditApp.clientId,
                        creditClientId,
                        'Credit client id registered',
                    );
                    assert.ok(rateApp.clientSecret, 'Rate client secret returned once');
                    assert.ok(creditApp.clientSecret, 'Credit client secret returned once');
                    return {rateClientId, creditClientId, rateApp, creditApp};
                },

                // Merge the dev-only probe bundles (roles + capabilities + actions)
                // plus the canonical 'Vision AI' demo bundle.
                async function mergeBundles(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await gatewayBundleMerge<{success: boolean}>(
                        {
                            bundle: {
                                'Meter Probe Rate': {
                                    roleBit: 102,
                                    capability: 'meterprobe',
                                    actions: 'meterprobe.rate',
                                    baseMonthlyCredits: 1000,
                                    rateLimit: 2,
                                    rateWindowSec: 60,
                                    isActive: true,
                                },
                                'Meter Probe Credit': {
                                    roleBit: 103,
                                    capability: 'meterprobe',
                                    actions: 'meterprobe.credit',
                                    baseMonthlyCredits: 10,
                                    rateLimit: 1000,
                                    rateWindowSec: 60,
                                    isActive: true,
                                },
                                'Vision AI': {
                                    roleBit: 100,
                                    capability: 'vision',
                                    actions: 'vision.compute',
                                    baseMonthlyCredits: 1000,
                                    rateLimit: 100,
                                    rateWindowSec: 60,
                                    isActive: true,
                                },
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.success, true, 'Probe bundles merged');
                    return result;
                },

                // Subscribe the rate app to 'Meter Probe Rate' + 'Vision AI' and the
                // credit app to 'Meter Probe Credit', so each app token carries the
                // right roleBits (uniform jwt authorization).
                async function subscribeApps(
                    assert: IAssert,
                    {
                        $meta,
                        registerApps,
                    }: {
                        $meta: IMeta;
                        registerApps: Awaited<{
                            rateClientId: string;
                            creditClientId: string;
                        }>;
                    },
                ) {
                    const {rateClientId, creditClientId} = await registerApps;
                    const result = await gatewaySubscriptionMerge<{success: boolean}>(
                        {
                            subscription: {
                                [`${rateClientId}Rate`]: {
                                    application: rateClientId,
                                    bundle: 'Meter Probe Rate',
                                    status: 'active',
                                    startsAt: '2000-01-01',
                                },
                                [`${rateClientId}Vision`]: {
                                    application: rateClientId,
                                    bundle: 'Vision AI',
                                    status: 'active',
                                    startsAt: '2000-01-01',
                                },
                                [`${creditClientId}Credit`]: {
                                    application: creditClientId,
                                    bundle: 'Meter Probe Credit',
                                    status: 'active',
                                    startsAt: '2000-01-01',
                                },
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.success, true, 'Subscriptions created');
                    return result;
                },

                // Mint an OAuth client_credentials token for the rate app.
                async function rateAppToken(
                    assert: IAssert,
                    {
                        $meta,
                        registerApps,
                    }: {
                        $meta: IMeta;
                        registerApps: Awaited<{rateApp: {clientId: string; clientSecret: string}}>;
                    },
                ) {
                    const {rateApp} = await registerApps;
                    const result = await loginTokenCreate<{
                        token_type: string;
                        access_token: string;
                    }>(
                        {
                            grantType: 'client_credentials',
                            clientId: rateApp.clientId,
                            clientSecret: rateApp.clientSecret,
                        },
                        $meta,
                    );
                    assert.equal(result.token_type, 'Bearer', 'Rate app token type is Bearer');
                    return {...result, rateApp};
                },

                // Rate fixture: rateLimit 2 → first two calls allowed, third is a
                // plugin-only 429 (rate).
                async function rateProbeBlocked(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    for (let i = 0; i < 2; i++) {
                        const result = await meterprobeRate<{success: boolean}>({}, $meta);
                        assert.equal(result.success, true, `rate probe call ${i + 1} allowed`);
                    }
                    let blocked = false;
                    try {
                        await meterprobeRate({}, $meta);
                    } catch (err: unknown) {
                        blocked = true;
                        const status = getHttpStatus(err);
                        assert.equal(status, 429, 'rate probe third call returns HTTP 429');
                    }
                    assert.equal(blocked, true, 'rate probe third call was blocked');
                },

                // Canonical metered demo route: the rate app succeeds over HTTP.
                async function visionHappyPath(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await visionCompute<{success: boolean; vision: string}>(
                        {},
                        $meta,
                    );
                    assert.equal(result.success, true, 'vision.compute succeeds over HTTP');
                    assert.equal(result.vision, 'computed', 'vision.compute returns result');
                },

                // Mint an OAuth client_credentials token for the credit app (the
                // browser MLE client switches to this token for subsequent calls).
                async function creditAppToken(
                    assert: IAssert,
                    {
                        $meta,
                        registerApps,
                    }: {
                        $meta: IMeta;
                        registerApps: Awaited<{
                            creditApp: {clientId: string; clientSecret: string};
                        }>;
                    },
                ) {
                    const {creditApp} = await registerApps;
                    const result = await loginTokenCreate<{
                        token_type: string;
                        access_token: string;
                    }>(
                        {
                            grantType: 'client_credentials',
                            clientId: creditApp.clientId,
                            clientSecret: creditApp.clientSecret,
                        },
                        $meta,
                    );
                    assert.equal(result.token_type, 'Bearer', 'Credit app token type is Bearer');
                    return {...result, creditApp};
                },

                // Credit fixture: 10 monthly credits at creditCost 5 → first two
                // calls allowed, third is a plugin-only 429 (credits).
                async function creditProbeBlocked(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    for (let i = 0; i < 2; i++) {
                        const result = await meterprobeCredit<{success: boolean}>({}, $meta);
                        assert.equal(result.success, true, `credit probe call ${i + 1} allowed`);
                    }
                    let blocked = false;
                    try {
                        await meterprobeCredit({}, $meta);
                    } catch (err: unknown) {
                        blocked = true;
                        const status = getHttpStatus(err);
                        assert.equal(status, 429, 'credit probe third call returns HTTP 429');
                    }
                    assert.equal(blocked, true, 'credit probe third call was blocked');
                },
            ]),
    }),
);
