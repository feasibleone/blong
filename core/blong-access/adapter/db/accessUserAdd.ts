import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.user.add` — create a user (resource + `access_user` row), plus
 * optional credentials and granted roles.
 *
 * Reuses `core.resource.ensure` to create the resource-backed row (the generic
 * knex `add` cannot — the PK is `uidNotNull`, not `uuid()`), and
 * `core.triple.merge` for the `hasRole` edges. Credentials are hashed via the
 * shared password library.
 */
export default handler(
    ({
        handler: {
            'db/coreResourceEnsure': coreResourceEnsure,
            'db/coreTripleMerge': coreTripleMerge,
        },
        lib: {hashPassword, credentialPolicyParams},
    }) => ({
        async accessUserAdd(
            params: {
                user?: {emailAddress?: string; isActive?: boolean; userName?: string};
                credential?: Array<Record<string, unknown>>;
                role?: Array<{roleId?: string; roleName?: string; granted?: boolean}>;
            },
            $meta: IMeta,
        ): Promise<Record<string, unknown>> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            const user = params.user ?? {};
            const name = user.emailAddress || user.userName || `user-${Date.now()}`;
            const {resourceId} = await coreResourceEnsure<{resourceId: string}>(
                {
                    name,
                    typeAlias: 'access.user',
                    table: 'access_user',
                    extraColumns: {
                        emailAddress: user.emailAddress ?? null,
                        isActive: user.isActive ?? 1,
                    },
                    keyName: 'userId',
                },
                $meta,
            );
            const userIdHex = model.binHex(resourceId);
            if (!userIdHex) throw new Error('Could not resolve user resource id');
            if (Array.isArray(params.credential) && params.credential.length) {
                await model.syncCredentials(
                    qb,
                    {hashPassword, credentialPolicyParams},
                    userIdHex,
                    params.credential,
                );
            }
            const roleIds = (params.role ?? [])
                .filter(r => r.granted !== false)
                .map(r => model.binHex(r.roleId))
                .filter((x): x is string => !!x);
            if (roleIds.length) {
                await model.syncEdges(qb, coreTripleMerge, userIdHex, 'hasRole', roleIds, $meta);
            }
            return {
                user: {
                    userId: model.bufToBase64(account.uuidBuf(resourceId)),
                    emailAddress: user.emailAddress ?? null,
                    isActive: user.isActive ?? 1,
                },
            };
        },
    }),
);
