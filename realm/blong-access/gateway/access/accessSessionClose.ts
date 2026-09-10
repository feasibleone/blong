import {validation} from '@feasibleone/blong';

/**
 * Protected RPC endpoint closing (revoking) a session.
 *
 * Wired as the "Close Session" toolbar action on the `access.session` browse
 * page. The session id arrives as the base64 wire representation of the
 * `binary(16)` `sessionId` column.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessSessionClose() {
            return {
                params: type.Object({
                    // Optional: when omitted, the caller's CURRENT session
                    // (`$meta.auth.sessionId`) is closed.
                    sessionId: type.Optional(type.String()),
                }),
                result: type.Object(
                    {
                        success: type.Boolean(),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
