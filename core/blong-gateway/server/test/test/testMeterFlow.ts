import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** Decode a JWT payload (base64url) into a plain object. */
function decodeToken(token: string): Record<string, unknown> {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
}

/** Extract the `per` claim (base64 permissionMap) from a JWT. */
function decodePermissionMap(token: string): Buffer {
    return Buffer.from(decodeToken(token).per as string, 'base64');
}

/**
 * Gateway meter flow — OAuth applications, bundles, subscriptions and the
 * atomic rate/credit metering, plus the uniform (jwt-style) authorization of
 * application tokens via the existing `access.authorization.list`.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            gatewayApplicationRegister,
            gatewayBundleMerge,
            gatewaySubscriptionMerge,
            accessAuthorizationList,
            gatewayMeterCheck,
            gatewayCreditAdjust,
            meterLimitReset,
        },
    }) => ({
        testMeterFlow: ({name = 'gateway meter flow'}: {name?: string} = {}) =>
            group(name)([
                // Log in as the seeded developer (testUser) to derive the owner id.
                async function loginDeveloper(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        token_type: string;
                        access_token: string;
                    }>({username: 'testUser', password: 'testPassword'}, $meta);
                    assert.equal(result.token_type, 'Bearer', 'Developer token type is Bearer');
                    return result;
                },

                // Register an OAuth application owned by the developer.
                async function registerApp(
                    assert: IAssert,
                    {
                        $meta,
                        loginDeveloper,
                    }: {$meta: IMeta; loginDeveloper: Awaited<{access_token: string}>},
                ) {
                    const {access_token} = await loginDeveloper;
                    const actorId = String(decodeToken(access_token).sub);
                    const app = await gatewayApplicationRegister<{
                        applicationId: string;
                        clientId: string;
                        clientSecret: string;
                    }>({clientId: 'test-app'}, {...$meta, auth: {actorId}});
                    assert.equal(app.clientId, 'test-app', 'Client id is test-app');
                    assert.ok(app.clientSecret, 'Client secret returned once');
                    return {...app, actorId};
                },

                // Reset any leftover metering state for the app (deterministic runs).
                async function resetMeter(
                    assert: IAssert,
                    {
                        $meta,
                        registerApp,
                    }: {$meta: IMeta; registerApp: Awaited<{applicationId: string}>},
                ) {
                    const app = await registerApp;
                    const result = await meterLimitReset<{success: boolean}>(
                        {
                            applicationId: app.applicationId,
                            bundleName: 'Vision AI',
                            clearCredits: true,
                        },
                        $meta,
                    );
                    assert.equal(result.success, true, 'Metering state reset');
                    return app;
                },

                // Merge the demo bundles (roles + capabilities + actions).
                async function mergeBundles(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await gatewayBundleMerge<{success: boolean}>(
                        {
                            bundle: {
                                'Vision AI': {
                                    roleBit: 100,
                                    capability: 'vision',
                                    actions: 'vision.compute',
                                    baseMonthlyCredits: 1000,
                                    rateLimit: 100,
                                    rateWindowSec: 60,
                                    isActive: true,
                                },
                                'Customer API': {
                                    roleBit: 101,
                                    capability: 'customer',
                                    actions: 'customer.get',
                                    baseMonthlyCredits: 500,
                                    rateLimit: 60,
                                    rateWindowSec: 60,
                                    isActive: true,
                                },
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.success, true, 'Bundles merged');
                    return result;
                },

                // Subscribe the app to the 'Vision AI' bundle.
                async function subscribeApp(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await gatewaySubscriptionMerge<{success: boolean}>(
                        {
                            subscription: {
                                testAppVision: {
                                    application: 'test-app',
                                    bundle: 'Vision AI',
                                    status: 'active',
                                    startsAt: '2000-01-01',
                                },
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.success, true, 'Subscription created');
                    return result;
                },

                // Mint an OAuth client_credentials token for the application.
                async function appToken(
                    assert: IAssert,
                    {
                        $meta,
                        registerApp,
                    }: {
                        $meta: IMeta;
                        registerApp: Awaited<{clientId: string; clientSecret: string}>;
                    },
                ) {
                    const app = await registerApp;
                    const result = await loginTokenCreate<{
                        token_type: string;
                        access_token: string;
                    }>(
                        {
                            grantType: 'client_credentials',
                            clientId: app.clientId,
                            clientSecret: app.clientSecret,
                        },
                        $meta,
                    );
                    assert.equal(result.token_type, 'Bearer', 'App token type is Bearer');
                    return {...result, app};
                },

                // Uniform authorization: access.authorization.list resolves the
                // bundle roleBit baked into the app token.
                async function uniformAuthorization(
                    assert: IAssert,
                    {$meta, appToken}: {$meta: IMeta; appToken: Awaited<{access_token: string}>},
                ) {
                    const {access_token} = await appToken;
                    const permissionMap = decodePermissionMap(access_token);
                    const actions = await accessAuthorizationList<string[]>({permissionMap}, $meta);
                    assert.ok(
                        actions.includes('visionCompute'.toLowerCase()),
                        'App actions include vision.compute (uniform authorization)',
                    );
                    assert.ok(
                        !actions.includes('customerGet'.toLowerCase()),
                        'App actions exclude customer.get (cross-bundle)',
                    );
                    return {actions};
                },

                // Meter a vision.compute call (creditCost 5): first request.
                async function meterFirst(
                    assert: IAssert,
                    {
                        $meta,
                        appToken,
                    }: {$meta: IMeta; appToken: Awaited<{app: {applicationId: string}}>},
                ) {
                    const {app} = await appToken;
                    const decision = await gatewayMeterCheck<{
                        allowed: boolean;
                        reason: string;
                        creditsRemaining: number;
                        rateLimit: number;
                    }>(
                        {bundle: 'Vision AI', creditCost: 5},
                        {...$meta, auth: {actorId: app.applicationId}},
                    );
                    assert.equal(decision.allowed, true, 'First metered call allowed');
                    assert.equal(
                        decision.creditsRemaining,
                        1000 - 5,
                        'Credits decremented by creditCost',
                    );
                    assert.ok(decision.rateLimit >= 1, 'Rate limit header data present');
                    return decision;
                },

                // Meter again: balance continues to decrease atomically.
                async function meterSecond(
                    assert: IAssert,
                    {
                        $meta,
                        appToken,
                    }: {$meta: IMeta; appToken: Awaited<{app: {applicationId: string}}>},
                ) {
                    const {app} = await appToken;
                    const decision = await gatewayMeterCheck<{
                        allowed: boolean;
                        creditsRemaining: number;
                    }>(
                        {bundle: 'Vision AI', creditCost: 5},
                        {...$meta, auth: {actorId: app.applicationId}},
                    );
                    assert.equal(decision.allowed, true, 'Second metered call allowed');
                    assert.equal(
                        decision.creditsRemaining,
                        1000 - 10,
                        'Credits decremented atomically across calls',
                    );
                    return decision;
                },

                // Cross-bundle scope block: app is not subscribed to 'Customer'.
                async function meterCrossBundleBlocked(
                    assert: IAssert,
                    {
                        $meta,
                        appToken,
                    }: {$meta: IMeta; appToken: Awaited<{app: {applicationId: string}}>},
                ) {
                    const {app} = await appToken;
                    const decision = await gatewayMeterCheck<{
                        allowed: boolean;
                        reason: string;
                    }>(
                        {bundle: 'Customer API', creditCost: 1},
                        {...$meta, auth: {actorId: app.applicationId}},
                    );
                    assert.equal(decision.allowed, false, 'Cross-bundle request blocked');
                    assert.equal(decision.reason, 'subscription', 'Block reason is subscription');
                    return decision;
                },

                // Mid-month credit scaling via HINCRBY.
                async function adjustCredits(
                    assert: IAssert,
                    {
                        $meta,
                        appToken,
                    }: {$meta: IMeta; appToken: Awaited<{app: {applicationId: string}}>},
                ) {
                    const {app} = await appToken;
                    const result = await gatewayCreditAdjust<{balance: number}>(
                        {applicationId: app.applicationId, delta: 500},
                        $meta,
                    );
                    assert.ok(result.balance >= 500, 'Credits scaled up mid-month');
                    return result;
                },
            ]),
    }),
);
