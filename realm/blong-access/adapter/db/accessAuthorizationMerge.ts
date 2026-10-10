import {handler} from '@feasibleone/blong';

import {SHORT_TYPE_ALIASES, type EnsuredRole} from './accessModel.ts';
import * as account from './account.ts';
import {type CredentialParams, type PasswordParams} from './password.ts';

type KnexQb = any;

/**
 * The sentinel graph node a wildcard ACL rule (`targetKind: 'all'`) is anchored
 * on — it stands for "every record" and gives the rule a real resource to point
 * at, so the FK and the ACL Rules page stay uniform.
 */
const ANY_TARGET_TYPE = 'access.any';
const ANY_TARGET_NAME = '(all records)';

/**
 * Resolve an existing graph node by its display name + type — seeds never
 * create the principals or targets they reference.
 */
async function resourceByName(qb: KnexQb, name: string, typeAlias: string): Promise<string> {
    const row = (await qb('core_resource as r')
        .join('core_type as t', 't.typeId', 'r.typeId')
        .where('t.typeAlias', typeAlias)
        .where('r.resourceName', name)
        .first('r.resourceId')) as {resourceId: Buffer} | undefined;
    if (!row) throw new Error(`Seed references an unknown ${typeAlias} named "${name}"`);
    return account.bufToUuid(row.resourceId);
}

export default handler(
    ({
        handler: {'db/accessRoleEnsure': accessRoleEnsure},
        lib: {hashPassword, credentialPolicyParams, ulid, crockfordDecode},
    }) => ({
        async accessAuthorizationMerge(
            params: {
                /**
                 * A **test** seed declares the *complete* list for the capabilities and users it
                 * names: the edges those subjects hold for the predicate this call writes are
                 * retracted first, so shortening a list in the file takes effect (F-357).
                 *
                 * `core.triple.merge` is additive on purpose — `onConflict ignore` makes replaying
                 * a production seed a no-op, and no seed may delete another realm's contribution.
                 * Roles stay additive even here: a shared role's capability list is a union that
                 * several files contribute to, and the graph carries no marker saying which
                 * contribution is this file's.
                 */
                replace?: boolean;
                user?: Record<
                    string,
                    {
                        password?: string;
                        credentialSalt?: string;
                        /** Display email persisted on the access_user row. */
                        emailAddress?: string | null;
                        isActive?: boolean;
                        roles?: string;
                    }
                >;
                role?: Record<string, string>;
                capability?: Record<string, string>;
                policy?: Record<
                    string,
                    {
                        credentialType: string;
                        minLength?: number;
                        requireSpecialChar?: boolean;
                        requireNumber?: boolean;
                        requireUppercase?: boolean;
                        maxAgeDays?: number;
                        maxAttempts?: number;
                        /** Credential-function parameters (JSON) the policy dictates for this type. */
                        credentialParams?: Partial<CredentialParams>;
                        isActive?: boolean;
                    }
                >;
                /**
                 * Implicit ACL grants: `<principal> --hasScope--> <scope>`.  The
                 * principal and the scope must exist (resolve them in the same
                 * file — the handler's earlier blocks run first).
                 */
                scope?: Array<{
                    role?: string;
                    user?: string;
                    /** Scope name (unit / organization / …). */
                    scope: string;
                    /** Short type of the scope (`unit`, `organization`, …) or a full `typeAlias`. */
                    scopeType?: string;
                }>;
                /**
                 * Record-level (ACL) rules.  Principals and targets are resolved
                 * against the graph (the ACL never creates principals or targets
                 * — only actions, like any other action resource), except the
                 * wildcard target `'*'`, which is anchored on the shared
                 * `access.any` sentinel node.
                 */
                acl?: Array<{
                    /** Principal name (user / role / unit / capability). */
                    principal: string;
                    /** Short type of the principal: `user`, `role`, `unit`, `capability` — or a full `typeAlias`. */
                    principalType?: string;
                    /** Action resource name, e.g. `accessUserEdit`. */
                    action?: string;
                    /** Comma or newline separated action names — each gets its own rule. */
                    actions?: string;
                    /** Target name — a record or a scope per `targetKind`; `'*'` means every record. */
                    target: string;
                    /** Short type of the target (`unit`, `organization`, `person`, `role`, …) or a full `typeAlias`. */
                    targetType?: string;
                    /** `record` (default), `scope`, or `all` (the wildcard target). */
                    targetKind?: string;
                    /** `allow` (default) or `deny` — a deny beats a grant for a record in a scope. */
                    effect?: string;
                }>;
            },
            $meta: Record<string, unknown>,
        ): Promise<{success: boolean; message?: string}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // Graph edges are batched and written via the shared `core.triple.merge`
            // helper (P3), which also refreshes `access_path` once at the end.
            const triples: Array<{
                subjectId: string;
                predicateName: string;
                objectId: string;
            }> = [];
            // The subjects this call declares, per predicate — the ones `replace` may retract the
            // edges of: a capability's action list and a user's role list are a seed's own rows.
            const declaredCapabilities = new Set<string>();
            const declaredUsers = new Set<string>();

            // 1. Process capabilities and their actions first
            if (params.capability) {
                for (const [capabilityName, actionList] of Object.entries(params.capability)) {
                    const actionNames = account.splitNames(actionList);
                    for (const actionName of actionNames) {
                        const {resourceId: actionId} = (await super.coreResourceEnsure(
                            {
                                name: actionName,
                                typeAlias: 'access.action',
                                table: 'access_action',
                                extraColumns: {description: `${actionName} action`},
                                keyName: 'actionId',
                            },
                            $meta,
                        )) as {resourceId: string};
                        const {resourceId: capabilityId} = (await super.coreResourceEnsure(
                            {
                                name: capabilityName,
                                typeAlias: 'access.capability',
                                table: 'access_capability',
                                extraColumns: {description: `${capabilityName} capability`},
                                keyName: 'capabilityId',
                            },
                            $meta,
                        )) as {resourceId: string};
                        declaredCapabilities.add(capabilityId);
                        triples.push({
                            subjectId: capabilityId,
                            predicateName: 'hasAction',
                            objectId: actionId,
                        });
                    }
                }
            }

            // 2. Process roles and their capabilities
            if (params.role) {
                for (const [roleName, capabilityList] of Object.entries(params.role)) {
                    const capabilityNames = account.splitNames(capabilityList);
                    // A role the merge names must exist: `access.role.ensure`
                    // allocates the bit when the role is new (it used to be
                    // hardcoded to 0 and silently skipped instead).
                    const {role: ensuredRole} = await accessRoleEnsure<EnsuredRole>(
                        {role: {roleName}},
                        $meta,
                    );
                    for (const capabilityName of capabilityNames) {
                        const {resourceId: capabilityId} = (await super.coreResourceEnsure(
                            {
                                name: capabilityName,
                                typeAlias: 'access.capability',
                                table: 'access_capability',
                                extraColumns: {description: `${capabilityName} capability`},
                                keyName: 'capabilityId',
                            },
                            $meta,
                        )) as {resourceId: string};
                        triples.push({
                            subjectId: ensuredRole.roleId,
                            predicateName: 'hasCapability',
                            objectId: capabilityId,
                        });
                    }
                }
            }

            // 3. Process users with credentials and role assignments
            if (params.user) {
                for (const [userName, userDef] of Object.entries(params.user)) {
                    const {resourceId: userId} = (await super.coreResourceEnsure(
                        {
                            name: userName,
                            typeAlias: 'access.user',
                            table: 'access_user',
                            extraColumns: {isActive: userDef.isActive ?? 1},
                            keyName: 'userId',
                        },
                        $meta,
                    )) as {resourceId: string};
                    // A user's role list is this file's to declare (`replace`).
                    declaredUsers.add(userId);

                    // Persist the display email even when the user already
                    // exists (coreResourceEnsure is insert-only on conflict), so
                    // seeds stay idempotent and the profile page shows a stable
                    // email across restarts.
                    if (userDef.emailAddress !== undefined) {
                        await qb('access_user')
                            .where('userId', account.uuidBuf(userId))
                            .update({emailAddress: userDef.emailAddress});
                    }

                    // Create credential if password is provided
                    if (userDef.password) {
                        const salt = userDef.credentialSalt ?? account.newUuid();
                        // Credential params come from the active policy; config.password is the fallback.
                        const policyParams = await credentialPolicyParams(qb, 'password');
                        const {hash, params: credentialParams} = hashPassword<{
                            hash: string;
                            params: PasswordParams;
                        }>(userDef.password, salt, policyParams);
                        await qb('access_credential')
                            .insert({
                                userId: account.uuidBuf(userId),
                                credentialType: 'password',
                                credentialHash: hash,
                                credentialSalt: salt,
                                // `*JSON` column — the knex adapter stores this object as JSON.
                                credentialParamsJSON: credentialParams,
                                isActive: userDef.isActive ?? 1,
                            })
                            .onConflict()
                            .ignore();
                    }

                    // Assign roles
                    if (userDef.roles) {
                        const roleNames = account.splitNames(userDef.roles);
                        for (const roleName of roleNames) {
                            const {role: ensuredRole} = await accessRoleEnsure<EnsuredRole>(
                                {role: {roleName}},
                                $meta,
                            );
                            triples.push({
                                subjectId: userId,
                                predicateName: 'hasRole',
                                objectId: ensuredRole.roleId,
                            });
                        }
                    }
                }
            }

            // 4. Process credential policies (password hashing params etc.)
            if (params.policy) {
                for (const [policyName, policyDef] of Object.entries(params.policy)) {
                    (await super.coreResourceEnsure(
                        {
                            name: policyName,
                            typeAlias: 'access.policy',
                            table: 'access_policy',
                            extraColumns: {
                                credentialType: policyDef.credentialType,
                                minLength: policyDef.minLength ?? null,
                                requireSpecialChar: policyDef.requireSpecialChar ?? null,
                                requireNumber: policyDef.requireNumber ?? null,
                                requireUppercase: policyDef.requireUppercase ?? null,
                                maxAgeDays: policyDef.maxAgeDays ?? null,
                                maxAttempts: policyDef.maxAttempts ?? null,
                                // `*JSON` column — the knex adapter stores this object as JSON.
                                credentialParamsJSON: policyDef.credentialParams ?? null,
                                isActive: policyDef.isActive ?? 1,
                            },
                            keyName: 'policyId',
                        },
                        $meta,
                    )) as {resourceId: string};
                }
            }

            // 4b. Implicit ACL grants: `<principal> --hasScope--> <scope>`.  The
            //     grant covers every action the principal holds and every record
            //     linked to the scope (including, through `isPartOf`, the records
            //     of its descendant scopes).
            for (const grant of params.scope ?? []) {
                const principal = grant.role ?? grant.user;
                if (!principal) continue;
                const principalId = await resourceByName(
                    qb,
                    principal,
                    grant.role ? 'access.role' : 'access.user',
                );
                const scopeId = await resourceByName(
                    qb,
                    grant.scope,
                    SHORT_TYPE_ALIASES[grant.scopeType ?? 'unit'] ??
                        grant.scopeType ??
                        'party.unit',
                );
                triples.push({
                    subjectId: principalId,
                    predicateName: 'hasScope',
                    objectId: scopeId,
                });
            }

            // 4c. Retract what a replacing test seed dropped: the edges the declared capabilities
            //     and users hold for the predicate this call writes (F-357).  The merge below counts
            //     itself in the durable generation, so the deferred `access_path` rebuild sees the
            //     retraction too — a dropped action stops authorizing.
            if (params.replace) {
                for (const [predicateName, ids] of [
                    ['hasAction', declaredCapabilities],
                    ['hasRole', declaredUsers],
                ] as Array<[string, Set<string>]>) {
                    if (ids.size) {
                        await qb('core_triple')
                            .where('predicateName', predicateName)
                            .whereIn('subjectId', [...ids].map(account.uuidBuf))
                            .delete();
                    }
                }
            }

            // 5. Write graph edges + refresh materialized paths via the shared
            //    `core.triple.merge` helper (P3).
            await super.coreTripleMerge({triples, refreshPath: true}, $meta);
            // 6. Record-level ACL rules.  Principals and targets are looked up
            //    (never created, except the wildcard sentinel below); the action is
            //    ensured like the RBAC steps above, so a seed may reference an
            //    action the same file grants.
            if (params.acl?.length) {
                for (const rule of params.acl) {
                    const principalId = await resourceByName(
                        qb,
                        rule.principal,
                        SHORT_TYPE_ALIASES[rule.principalType ?? 'role'] ??
                            rule.principalType ??
                            'access.role',
                    );
                    // `target: '*'` grants on *every* record: the rule still needs
                    // an anchor resource, which the shared `access.any` node is.
                    const wildcard = rule.targetKind === 'all' || rule.target === '*';
                    const targetId = wildcard
                        ? (
                              (await super.coreResourceEnsure(
                                  {name: ANY_TARGET_NAME, typeAlias: ANY_TARGET_TYPE},
                                  $meta,
                              )) as {resourceId: string}
                          ).resourceId
                        : await resourceByName(
                              qb,
                              rule.target,
                              SHORT_TYPE_ALIASES[rule.targetType ?? 'unit'] ??
                                  rule.targetType ??
                                  'party.unit',
                          );
                    for (const actionName of account.splitNames(
                        rule.actions ?? rule.action ?? '',
                    )) {
                        const {resourceId: actionId} = (await super.coreResourceEnsure(
                            {
                                name: actionName,
                                typeAlias: 'access.action',
                                table: 'access_action',
                                extraColumns: {description: `${actionName} action`},
                                keyName: 'actionId',
                            },
                            $meta,
                        )) as {resourceId: string};
                        await qb('access_acl')
                            .insert({
                                aclId: Buffer.from(crockfordDecode(ulid())),
                                principalId: account.uuidBuf(principalId),
                                actionId: account.uuidBuf(actionId),
                                targetId: account.uuidBuf(targetId),
                                targetKind: wildcard ? 'all' : (rule.targetKind ?? 'record'),
                                effect: rule.effect ?? 'allow',
                                isActive: 1,
                            })
                            .onConflict()
                            .ignore();
                    }
                }
            }

            return {success: true};
        },
    }),
);
