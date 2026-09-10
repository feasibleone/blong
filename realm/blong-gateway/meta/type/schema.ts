import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    /**
     * Registered OAuth applications (developers' API consumers).
     *
     * The PK is a FK to `core.resource.resourceId`; the clientId is the
     * `core_resource.resourceName`.  `ownerUserId` links the application to the
     * developer's `access.user`.  Client credentials live in
     * `access.credential` (`credentialType: 'clientSecret'`).
     */
    application: type.Object(
        {
            applicationId: type.uuid(),
            ownerUserId: type.uidNull(),
            applicationType: type.stringNotNull(),
            description: type.stringNull(),
            isActive: type.booleanNotNull(),
        },
        {
            constraints: {
                primaryKey: 'applicationId',
                foreign: {
                    applicationId: 'core.resource.resourceId',
                    ownerUserId: 'access.user.userId',
                },
            },
        },
    ),

    /**
     * API bundles — metered offerings that wrap an `access.role` (whose
     * capabilities/actions are the bundle's authorized scopes).
     *
     * Modelling the bundle as a role makes authorization uniform in the jwt
     * plugin: an application subscribes with `hasRole` edges and its token's
     * `per` carries the bundle `roleBit`s, resolved by the existing
     * `access.authorization.list`.
     */
    bundle: type.Object(
        {
            bundleId: type.uuid(),
            // Optional in the API (the generic create form does not collect it;
            // `gateway.bundle.add` / `gateway.bundle.merge` always populate it).
            // Still backed by a binary(16) FK to access.role.
            roleId: type.uidNull(),
            isActive: type.booleanNotNull(),
            baseMonthlyCredits: type.bigIntNotNull(),
            rateLimit: type.integerNotNull(),
            rateWindowSec: type.integerNotNull(),
            description: type.stringNull(),
        },
        {
            constraints: {
                primaryKey: 'bundleId',
                unique: {
                    roleId: {},
                },
                foreign: {
                    bundleId: 'core.resource.resourceId',
                    roleId: 'access.role.roleId',
                },
            },
        },
    ),

    /**
     * Active subscriptions linking an application to a bundle.
     *
     * `status` is 'active' | 'suspended' | 'cancelled'.  An active subscription
     * also creates the `application hasRole bundleRole` core.triple edge so the
     * application's effective actions (and hence authorization) follow from the
     * bundle.  Cancelling/suspending takes effect immediately at the metering
     * layer (cfg invalidation + active-subscription check).
     */
    subscription: type.Object(
        {
            subscriptionId: type.uuid(),
            applicationId: type.uidNotNull(),
            bundleId: type.uidNotNull(),
            status: type.stringNotNull(),
            startsAt: type.dateTimeNotNull(),
            endsAt: type.dateTimeNull(),
            createdAt: type.dateTimeNull(),
        },
        {
            constraints: {
                primaryKey: 'subscriptionId',
                unique: {
                    appBundle: {columns: ['applicationId', 'bundleId']},
                },
                foreign: {
                    applicationId: 'gateway.application.applicationId',
                    bundleId: 'gateway.bundle.bundleId',
                },
            },
        },
    ),
}));
