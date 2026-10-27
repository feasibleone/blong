import {type IMeta} from '@feasibleone/blong';

import {type AclMatrixRow} from './accessModel.ts';
import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * `access.user.add` — create a user (resource + `access_user` row), plus
 * optional credentials and granted roles.
 *
 * Reuses `core.resource.ensure` to create the resource-backed row (the generic
 * knex `add` cannot — the PK is `uidNotNull`, not `uuid()`), and writes the
 * `hasRole` edges with their rebuild in `syncEdges`. Credentials are hashed
 * via the shared password library. A submitted `matrix` seeds the user's own
 * scope-level `access_acl` rules.
 */
export default handler(
    ({
        lib: {
            binHex,
            bufToBase64,
            credentialPolicyParams,
            crockfordDecode,
            hashPassword,
            resolveRoleIds,
            syncAclMatrix,
            syncCredentials,
            syncEdges,
            ulid,
            uuidBuf,
        },
    }) => ({
        async accessUserAdd(
            params: {
                user?: {emailAddress?: string; isActive?: boolean; userName?: string};
                credential?: Array<Record<string, unknown>>;
                role?: Array<{roleId?: string; roleName?: string; granted?: boolean}>;
                matrix?: AclMatrixRow[];
            },
            $meta: IMeta,
        ): Promise<Record<string, unknown>> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            const user = params.user ?? {};
            const name = user.emailAddress || user.userName || `user-${Date.now()}`;
            // A role may be named rather than identified (`roleName` was accepted
            // by the schema and then dropped), so the resolution is shared with
            // `access.user.edit`. @@D-648
            const roleIds = await resolveRoleIds(qb, params.role ?? []);
            // Everything this handler writes is ONE transaction: the resource row and
            // its `access_user` entity row, the credentials (several rows), the granted
            // roles (with the rebuild inside `syncEdges`) and the scope ACL matrix.
            // Committing them one by one left a user whose credentials were stored and
            // whose roles were not, with the caller only seeing an error.
            // `core.resource.ensure` belongs to `core`, a *library* realm this process
            // carries itself, so `super` reaches it by prototype-chain delegation —
            // same process, same connection — and it takes the transaction we are in.
            const resourceId = await qb.transaction(async (trx: KnexQb) => {
                // `super` is untyped (its members live on the prototype chain the
                // framework wires, not in a class declaration), so the shape is
                // asserted here rather than passed as a type argument.
                const {resourceId} = (await super.coreResourceEnsure(
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
                    trx,
                )) as {resourceId: string};
                const userIdHex = binHex(resourceId);
                if (!userIdHex) throw new Error('Could not resolve user resource id');
                if (Array.isArray(params.credential) && params.credential.length) {
                    await syncCredentials(
                        trx,
                        {hashPassword, credentialPolicyParams},
                        userIdHex,
                        params.credential,
                    );
                }
                if (roleIds.length) {
                    await syncEdges(trx, userIdHex, 'hasRole', roleIds);
                }
                if (Array.isArray(params.matrix) && params.matrix.length) {
                    await syncAclMatrix(
                        trx,
                        {
                            // The helper has no `super` of its own, so the binding is
                            // closed over here — still the same transaction.
                            coreResourceEnsure: (p: any, m: IMeta) =>
                                super.coreResourceEnsure(p, m, trx),
                            newAclId: () => Buffer.from(crockfordDecode(ulid())),
                        },
                        userIdHex,
                        params.matrix,
                        $meta,
                    );
                }
                return resourceId;
            });
            return {
                user: {
                    userId: bufToBase64(uuidBuf(resourceId)),
                    emailAddress: user.emailAddress ?? null,
                    isActive: user.isActive ?? 1,
                },
            };
        },
    }),
);
