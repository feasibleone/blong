import {validation} from '@feasibleone/blong';

/**
 * Protected RPC endpoint returning the authenticated user's own profile:
 * account details (username, email, active flag), the persisted preferred
 * language, the granted roles and — when available — the linked party.person.
 *
 * Self-service: bearer-authenticated but no RBAC action needed (`skipAuthorize`
 * — the actor id comes from the token's `sub` claim, never from params).
 */
export default validation(
    async ({lib: {type}}) =>
        function accessProfileGet() {
            return {
                skipAuthorize: true,
                params: type.Object({}),
                result: type.Object(
                    {
                        userId: type.String(),
                        userName: type.Union([type.String(), type.Null()]),
                        emailAddress: type.Union([type.String(), type.Null()]),
                        isActive: type.Boolean(),
                        preferredLanguage: type.Union([type.String(), type.Null()]),
                        roles: type.Array(
                            type.Object(
                                {
                                    roleId: type.String(),
                                    roleName: type.String(),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                        person: type.Optional(
                            type.Object(
                                {
                                    personId: type.String(),
                                    firstName: type.String(),
                                    middleName: type.Union([type.String(), type.Null()]),
                                    lastName: type.String(),
                                    birthDate: type.Union([type.String(), type.Null()]),
                                    gender: type.Union([type.String(), type.Null()]),
                                    nationality: type.Union([type.String(), type.Null()]),
                                    occupation: type.Union([type.String(), type.Null()]),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
