import {handler} from '@feasibleone/blong';

import * as account from './account.ts';
import {type CredentialParams, type PasswordParams} from './password.ts';

type KnexQb = any;

export default handler(
    ({
        handler: {
            'db/coreResourceEnsure': coreResourceEnsure,
            'db/coreTripleMerge': coreTripleMerge,
        },
        lib: {hashPassword, credentialPolicyParams},
    }) =>
        async function accessAuthorizationMerge(
            params: {
                user?: Record<
                    string,
                    {
                        password?: string;
                        credentialSalt?: string;
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

            // 1. Process capabilities and their actions first
            if (params.capability) {
                for (const [capabilityName, actionList] of Object.entries(params.capability)) {
                    const actionNames = account.splitNames(actionList);
                    for (const actionName of actionNames) {
                        const {resourceId: actionId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: actionName,
                                typeAlias: 'access.action',
                                table: 'access_action',
                                extraColumns: {description: `${actionName} action`},
                                keyName: 'actionId',
                            },
                            $meta,
                        );
                        const {resourceId: capabilityId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: capabilityName,
                                typeAlias: 'access.capability',
                                table: 'access_capability',
                                extraColumns: {description: `${capabilityName} capability`},
                                keyName: 'capabilityId',
                            },
                            $meta,
                        );
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
                    const {resourceId: roleId} = await coreResourceEnsure<{resourceId: string}>(
                        {
                            name: roleName,
                            typeAlias: 'access.role',
                            table: 'access_role',
                            extraColumns: {roleBit: 0, description: `${roleName} role`},
                            keyName: 'roleId',
                        },
                        $meta,
                    );
                    for (const capabilityName of capabilityNames) {
                        const {resourceId: capabilityId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: capabilityName,
                                typeAlias: 'access.capability',
                                table: 'access_capability',
                                extraColumns: {description: `${capabilityName} capability`},
                                keyName: 'capabilityId',
                            },
                            $meta,
                        );
                        triples.push({
                            subjectId: roleId,
                            predicateName: 'hasCapability',
                            objectId: capabilityId,
                        });
                    }
                }
            }

            // 3. Process users with credentials and role assignments
            if (params.user) {
                for (const [userName, userDef] of Object.entries(params.user)) {
                    const {resourceId: userId} = await coreResourceEnsure<{resourceId: string}>(
                        {
                            name: userName,
                            typeAlias: 'access.user',
                            table: 'access_user',
                            extraColumns: {isActive: userDef.isActive ?? 1},
                            keyName: 'userId',
                        },
                        $meta,
                    );

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
                            const {resourceId: roleId} = await coreResourceEnsure<{
                                resourceId: string;
                            }>(
                                {
                                    name: roleName,
                                    typeAlias: 'access.role',
                                    table: 'access_role',
                                    extraColumns: {roleBit: 0, description: `${roleName} role`},
                                    keyName: 'roleId',
                                },
                                $meta,
                            );
                            triples.push({
                                subjectId: userId,
                                predicateName: 'hasRole',
                                objectId: roleId,
                            });
                        }
                    }
                }
            }

            // 4. Process credential policies (password hashing params etc.)
            if (params.policy) {
                for (const [policyName, policyDef] of Object.entries(params.policy)) {
                    await coreResourceEnsure<{resourceId: string}>(
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
                    );
                }
            }

            // 5. Write graph edges + refresh materialized paths via the shared
            //    `core.triple.merge` helper (P3).
            await coreTripleMerge({triples, refreshPath: true}, $meta);

            return {success: true};
        },
);
