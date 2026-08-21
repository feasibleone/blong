import {validation} from '@feasibleone/blong';

/**
 * `access.profile.password.change` — change the caller's own password. The
 * actor id comes from the token's `sub` claim (never from params), so this is
 * a self-service method: bearer-authenticated but no RBAC action needed.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessProfilePasswordChange() {
            return {
                skipAuthorize: true,
                params: type.Object({
                    currentPassword: type.String(),
                    newPassword: type.String(),
                }),
                result: type.Object(
                    {success: type.Boolean()},
                    {additionalProperties: true},
                ),
            };
        },
);
