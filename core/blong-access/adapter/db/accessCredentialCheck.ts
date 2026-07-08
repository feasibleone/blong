import {handler} from '@feasibleone/blong';
import crypto from 'crypto';

const _iterations = 100000;
const _keyLength = 64;
const _digest = 'sha512';

/**
 * Verify a password against a PBKDF2-derived hash and salt.
 */
function verifyPassword(password: string, hash: string, salt: string): boolean {
    const derivedKey = crypto.pbkdf2Sync(password, salt, _iterations, _keyLength, _digest);
    return derivedKey.toString('hex') === hash;
}

export default handler(
    ({errors, lib: {crockfordEncode}}) =>
        async function accessCredentialCheck(
            params: {username: string; password: string},
            _$meta: Record<string, unknown>,
        ): Promise<{
            userId: string;
            roleBits: number[];
            permissionMap: string;
            actions: string[];
        }> {
            const queryBuilder = this.config?.context?.queryBuilder;
            if (!queryBuilder) throw new Error('Database not available');

            // 1. Find the user by username (resourceName) and type alias 'access.user'
            const user = await queryBuilder
                .select('r.resourceId', 'u.userId', 'u.isActive')
                .from('core_resource as r')
                .join('access_user as u', 'u.userId', 'r.resourceId')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('r.resourceName', params.username)
                .where('t.typeAlias', 'access.user')
                .first();

            if (!user) {
                throw errors.userNotFound();
            }

            if (!user.isActive) {
                throw errors.userInactive();
            }

            // 2. Find the active credential for this user
            const credential = await queryBuilder
                .select('credentialId', 'credentialHash', 'credentialSalt')
                .from('access_credential')
                .where('userId', user.userId)
                .where('isActive', 1)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .where(function (this: any) {
                    this.whereNull('expiresAt').orWhere('expiresAt', '>', new Date());
                })
                .first();

            if (!credential) {
                throw errors.credentialNotFound();
            }

            // 3. Verify password against stored PBKDF2 hash
            if (
                !verifyPassword(
                    params.password,
                    credential.credentialHash,
                    credential.credentialSalt,
                )
            ) {
                throw errors.credentialsMismatch();
            }

            // 4. Find effective role bits via core_path (materialized from access_effectiveRolePath)
            const roles = await queryBuilder
                .select('r.roleBit')
                .from('access_role as r')
                .join('core_path as p', 'p.destinationId', 'r.roleId')
                .where('p.originId', user.userId)
                .where('p.pathType', 'access.effectiveRole');

            const roleBits = roles.map((r: {roleBit: number}) => r.roleBit);

            // 5. Find effective actions via core_path (materialized from access_effectiveActionPath)
            const actions = await queryBuilder
                .select('res.resourceName')
                .from('core_resource as res')
                .join('core_path as p', 'p.destinationId', 'res.resourceId')
                .where('p.originId', user.userId)
                .where('p.pathType', 'access.effectiveAction');

            const actionNames = actions.map((a: {resourceName: string}) => a.resourceName);

            // 6. Encode role bits into Crockford Base32 bitmask
            const maxRoleBit = Math.max(...roleBits);
            if (maxRoleBit > 1023)
                throw new Error('Role bit exceeds maximum allowed value of 1023');

            const permissionMap: string = crockfordEncode(
                roleBits.reduce(
                    (acc, bit) => {
                        const byteIndex = Math.floor(bit / 8);
                        const bitIndex = bit % 8;
                        acc[byteIndex] |= 1 << bitIndex;
                        return acc;
                    },
                    new Uint8Array(Math.ceil(maxRoleBit / 8 + 1)),
                ),
            );

            return {
                userId: user.userId,
                roleBits,
                permissionMap,
                actions: actionNames,
            };
        },
);
