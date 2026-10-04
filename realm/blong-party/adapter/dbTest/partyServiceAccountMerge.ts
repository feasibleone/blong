import {type IMeta, handler} from '@feasibleone/blong';

// The knex query builder is intentionally untyped here (matches the access realm's db handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/**
 * dbTest seed — service accounts for the party hierarchy.
 *
 * A service account is not a new kind of subject: it is an `access_user`
 * profile attached to the organization or unit resource itself, so the profile's
 * `userId` IS that resource's id.  Three things make it usable:
 *
 * 1. `access.user.merge` writes the profile and its `clientId` (a distinct
 *    string — the resource name belongs to the party hierarchy).
 * 2. `access.credential.add` writes the `clientSecret` the account presents.
 * 3. A `hasRole` edge gives it the fixture's roles, so `access_pathRefresh`
 *    materializes the same effective roles a person user gets.
 *
 * Authentication is then the OAuth `client_credentials` grant:
 * `access.credential.checkClient` resolves the subject by `clientId` and
 * `login.token.create` mints a token whose `sub` is the organization's or unit's
 * resource id — which is exactly the `actorId` the record-level ACL reads.
 *
 * Wire: `party.service.account.merge` — dispatched from
 * `meta/dbTest/22-aclMatrix-partyServiceAccountMerge.yaml`.
 *
 * Lives in `adapter/dbTest/` because it is a TEST-ONLY seed: the db adapter
 * imports `.dbTest` handler groups only under `dev`, never in production.
 */
export default handler(() => ({
    async partyServiceAccountMerge(
        params: {
            serviceAccount?: Array<{
                /** Existing resource the account acts as. */
                resource: string;
                /** Its type alias — the name is resolved within the type. */
                typeAlias: string;
                /** OAuth client id the account authenticates with. */
                clientId: string;
                /** Role granted to the account (`<account> --hasRole--> <role>`). */
                role?: string;
                /** Per-account secret override. */
                secret?: string;
                isActive?: boolean;
            }>;
            /** Shared client secret for every account without its own. */
            secret?: string;
        },
        $meta: IMeta,
    ): Promise<{success: boolean; serviceAccount: Array<{clientId: string; resourceId: string}>}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        /** Resolve an existing resource by name + type alias to a hex UUID. */
        const resourceIdOf = async (name: string, typeAlias: string): Promise<string> => {
            const row = (await qb('core_resource as r')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('t.typeAlias', typeAlias)
                .where('r.resourceName', name)
                .first('r.resourceId')) as {resourceId: Buffer} | undefined;
            if (!row) {
                throw new Error(
                    `Service-account seed references an unknown ${typeAlias} "${name}"`,
                );
            }
            // Hex without dashes — the form `access.credential.add` and the triple
            // merge both accept.
            return Buffer.from(row.resourceId).toString('hex');
        };

        /** Resolve a role resource by name to a hex UUID. */
        const roleIdOf = async (roleName: string): Promise<string> => {
            const row = (await qb('core_resource as r')
                .join('access_role as a', 'a.roleId', 'r.resourceId')
                .where('r.resourceName', roleName)
                .first('r.resourceId')) as {resourceId: Buffer} | undefined;
            if (!row)
                throw new Error(`Service-account seed references an unknown role "${roleName}"`);
            return Buffer.from(row.resourceId).toString('hex');
        };

        const accounts = params.serviceAccount ?? [];
        const triples: Array<{subjectId: string; predicateName: string; objectId: string}> = [];
        const result: Array<{clientId: string; resourceId: string}> = [];
        for (const row of accounts) {
            const secret = row.secret ?? params.secret;
            if (!secret) {
                throw new Error(`Service-account seed has no secret for client "${row.clientId}"`);
            }
            // 1. The profile on the EXISTING resource, with its clientId.
            await super.accessUserMerge(
                {
                    user: [
                        {
                            resourceName: row.resource,
                            typeAlias: row.typeAlias,
                            clientId: row.clientId,
                            isActive: row.isActive ?? true,
                        },
                    ],
                },
                $meta,
            );
            const resourceId = await resourceIdOf(row.resource, row.typeAlias);

            // 2. The client secret it presents (rotates any previous one).
            await super.accessCredentialAdd(
                {
                    subjectResourceId: resourceId,
                    credentialType: 'clientSecret',
                    secret,
                    isActive: row.isActive ?? true,
                },
                $meta,
            );

            // 3. Its role, deferred into one edge batch.
            if (row.role) {
                triples.push({
                    subjectId: resourceId,
                    predicateName: 'hasRole',
                    objectId: await roleIdOf(row.role),
                });
            }
            result.push({clientId: row.clientId, resourceId});
        }

        // The seed is AUTHORITATIVE for the roles of the accounts it names: the
        // triple merge is insert-ignore, so a role the fixture no longer grants
        // would otherwise keep its `hasRole` edge and its scope for good.
        const subjectIds = result.map(row => Buffer.from(row.resourceId, 'hex'));
        if (subjectIds.length) {
            await qb('core_triple')
                .whereIn('subjectId', subjectIds)
                .where('predicateName', 'hasRole')
                .del();
        }

        // One path refresh for the whole batch, so the accounts' effective roles
        // and scopes are materialized before the tests run (as the hierarchy seed
        // does for the party tree).
        if (triples.length) await super.coreTripleMerge({triples, refreshPath: true}, $meta);

        return {success: true, serviceAccount: result};
    },
}));
