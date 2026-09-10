import {validation} from '@feasibleone/blong';

/**
 * `access.profile.edit` — update the caller's own profile (email, preferred
 * language, and — when a linked party.person exists — name fields). The actor
 * id comes from the token's `sub` claim, never from params, so this is a
 * self-service method: bearer-authenticated but no RBAC action needed.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessProfileEdit() {
            return {
                skipAuthorize: true,
                params: type.Object(
                    {
                        firstName: type.Optional(type.Union([type.String(), type.Null()])),
                        middleName: type.Optional(type.Union([type.String(), type.Null()])),
                        lastName: type.Optional(type.Union([type.String(), type.Null()])),
                        emailAddress: type.Optional(type.Union([type.String(), type.Null()])),
                        preferredLanguage: type.Optional(
                            type.Union([type.String(), type.Null()]),
                        ),
                    },
                    {additionalProperties: true},
                ),
                result: type.Object(
                    {success: type.Boolean()},
                    {additionalProperties: true},
                ),
            };
        },
);
