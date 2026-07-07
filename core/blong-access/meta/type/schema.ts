import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    /**
     * User profiles attached to core.resource records.
     *
     * `core.resource.typeId` discriminates between 'person', 'organization', and 'system'
     * profiles.  The PK `userId` is also a FK to core.resource.resourceId,
     * so every user corresponds to a resource entity.
     */
    user: type.Object(
        {
            userId: type.uidNotNull(),
            emailAddress: type.stringNull(),
            isActive: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    userId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Authenticator records bound to a user.
     *
     * `credentialType` is 'password' or 'clientSecret'.  The secret is
     * hashed with PBKDF2 (or a stronger algorithm) before storage.
     */
    credential: type.Object(
        {
            credentialId: type.increment(),
            userId: type.uidNotNull(),
            credentialType: type.stringNotNull(),
            credentialHash: type.stringNotNull(),
            credentialSalt: type.stringNotNull(),
            isActive: type.booleanNotNull(),
            expiresAt: type.dateTimeNull(),
        },
        {
            constraints: {
                foreign: {
                    userId: 'access.user.userId',
                },
            },
        },
    ),

    /**
     * Registered actions that the backend supports.
     *
     * The action name is stored in core.resource.resourceName and follows
     * the semantic-triple naming convention (subjectObjectPredicate) to
     * match API methods.
     */
    action: type.Object(
        {
            actionId: type.uidNotNull(),
            description: type.stringNull(),
        },
        {
            constraints: {
                foreign: {
                    actionId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Named business capabilities that group low-level actions.
     *
     * Capabilities are the "what" — they bundle related actions into
     * a meaningful concept (e.g. "userManagement", "reportViewing").
     * The capability name is stored in core.resource.resourceName.
     */
    capability: type.Object(
        {
            capabilityId: type.uidNotNull(),
            description: type.stringNull(),
        },
        {
            constraints: {
                foreign: {
                    capabilityId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Named roles that group capabilities.
     *
     * Roles are the intermediate link between users and capabilities.
     * Users are assigned roles, roles carry capabilities.
     * The role name is stored in core.resource.resourceName.
     */
    role: type.Object(
        {
            roleId: type.uidNotNull(),
            roleBit: type.integerNotNull({min: 0, max: 1023}),
            description: type.stringNull(),
        },
        {
            constraints: {
                foreign: {
                    roleId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Access rules applicable to the system.
     *
     * Each access record defines conditions that must be satisfied
     * for access to be granted — e.g. time restrictions, IP allow
     * lists, geo-fencing.  `accessRule` holds the rule configuration
     * as a JSON string.  The access rule name is stored in
     * core.resource.resourceName.
     */
    access: type.Object(
        {
            accessId: type.uidNotNull(),
            accessType: type.stringNotNull(),
            accessRule: type.stringNotNull(),
            isActive: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    accessId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Credential policy rules.
     *
     * Defines complexity requirements and lifecycle constraints per
     * credential type (e.g. minimum password length, required
     * character classes, max age, max failed attempts).
     * The policy name is stored in core.resource.resourceName.
     */
    policy: type.Object(
        {
            policyId: type.uidNotNull(),
            credentialType: type.stringNotNull(),
            minLength: type.integerNull(),
            requireSpecialChar: type.booleanNull(),
            requireNumber: type.booleanNull(),
            requireUppercase: type.booleanNull(),
            maxAgeDays: type.integerNull(),
            maxAttempts: type.integerNull(),
            isActive: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    policyId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Authentication flows that define multi-factor login steps.
     *
     * `flowSteps` is a JSON array of step definitions — e.g.
     * `["password", "totp"]` for a two-factor flow.
     * The flow name is stored in core.resource.resourceName.
     */
    flow: type.Object(
        {
            flowId: type.uidNotNull(),
            flowSteps: type.stringNotNull(),
            isActive: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    flowId: 'core.resource.resourceId',
                },
            },
        },
    ),

    /**
     * Active user sessions (ephemeral runtime records).
     *
     * Session records are created upon successful authentication and
     * are not persisted as core.resource entries — the PK is a
     * standalone uid.
     */
    session: type.Object(
        {
            sessionId: type.uidNotNull(),
            userId: type.uidNotNull(),
            credentialId: type.bigIntNotNull(),
            tokenHash: type.stringNotNull(),
            issuedAt: type.dateTimeNotNull(),
            expiresAt: type.dateTimeNotNull(),
            ipAddress: type.stringNull(),
            isRevoked: type.booleanNotNull(),
        },
        {
            constraints: {
                foreign: {
                    userId: 'access.user.userId',
                    credentialId: 'access.credential.credentialId',
                },
            },
        },
    ),

    /**
     * Append-only audit log for authentication events.
     *
     * Each entry records an attempt (success or failure) with context
     * for security analysis.  Uses a ULID PK to avoid
     * core.resource overhead.
     */
    audit: type.Object({
        auditId: type.ulid(),
        userId: type.uidNull(),
        actionName: type.stringNotNull(),
        credentialType: type.stringNull(),
        ipAddress: type.stringNull(),
        isSuccess: type.booleanNotNull(),
        failureReason: type.stringNull(),
        occurredAt: type.dateTimeNotNull(),
    }),
}));
