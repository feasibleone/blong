import {validation} from '@feasibleone/blong';

/**
 * `access.profile.edit` — update the caller's own profile (email, preferred
 * language, name fields and the photograph). The actor id comes from the
 * token's `sub` claim, never from params, so this is a self-service method:
 * bearer-authenticated but no RBAC action needed.
 *
 * The name fields reach a `party.person`, and an account that has none yet gets
 * one created from the first edit that carries both names — see the adapter
 * handler, which makes the call through the party realm.
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
                        photoUrl: type.Optional(type.Union([type.String(), type.Null()])),
                        emailAddress: type.Optional(type.Union([type.String(), type.Null()])),
                        preferredLanguage: type.Optional(type.Union([type.String(), type.Null()])),
                    },
                    {additionalProperties: true},
                ),
                result: type.Object({success: type.Boolean()}, {additionalProperties: true}),
            };
        },
);
