import {handler} from '@feasibleone/blong';

export default handler(
    ({lib: {crockfordEncode}}) =>
        async function accessCredentialCheck(
            _params: {username: string; password: string},
            _$meta: Record<string, unknown>,
        ): Promise<{
            userId: string;
            /** Base64 of the raw binary(16) user key — for session creation. */
            userKey: string;
            /** Active credential id — for session creation. */
            credentialId: number;
            permissionMap: string;
            actions: string[];
        }> {
            const id = Buffer.from([1]);
            return {
                userId: crockfordEncode(id),
                userKey: Buffer.from(id).toString('base64'),
                credentialId: 1,
                permissionMap: '',
                actions: ['accessLogin'],
            };
        },
);
