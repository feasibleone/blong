import {handler} from '@feasibleone/blong';
import crypto from 'node:crypto';

const _iterations = 100000;
const _keyLength = 64;
const _digest = 'sha512';

type KnexQb = any;

/** Convert a UUID string to a BINARY(16) Buffer for MySQL. */
function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Read a BINARY(16) value from MySQL and return a hex string. */
function bufToUuid(buf: Buffer | string): string {
    if (typeof buf === 'string') return buf;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a random UUID v4 string. */
function newUuid(): string {
    return crypto.randomUUID();
}

/**
 * Ensure a core_type row exists for the given alias, returning its typeId (integer).
 */
async function ensureType(qb: KnexQb, typeAlias: string): Promise<number> {
    const row = await qb.select('typeId').from('core_type').where({typeAlias}).first();
    if (row) return row.typeId;
    await qb('core_type').insert({typeAlias}).onConflict().ignore();
    const inserted = await qb.select('typeId').from('core_type').where({typeAlias}).first();
    return inserted!.typeId;
}

/**
 * Ensure a core_resource + table row exist for a named entity.
 * Returns the resourceId (hex string).
 */
async function ensureResource(
    qb: KnexQb,
    name: string,
    typeAlias: string,
    table: string,
    extraColumns: Record<string, unknown>,
    keyName: string,
): Promise<string> {
    const existing = await qb
        .select('core_resource.resourceId')
        .from('core_resource')
        .join('core_type', 'core_resource.typeId', 'core_type.typeId')
        .where('core_type.typeAlias', typeAlias)
        .where('core_resource.resourceName', name)
        .first();
    if (existing) return bufToUuid(existing.resourceId);

    const typeId = await ensureType(qb, typeAlias);
    const resourceId = newUuid();
    // resourceId is BINARY(16), typeId is bigInt — pass directly
    await qb('core_resource')
        .insert({resourceId: uuidBuf(resourceId), resourceName: name, typeId})
        .onConflict()
        .ignore();
    await qb(table)
        .insert({[keyName]: uuidBuf(resourceId), ...extraColumns})
        .onConflict(keyName)
        .merge();
    return resourceId;
}

/**
 * Split a comma-separated string of names, trimming whitespace
 * and filtering out empty entries.
 */
function splitNames(value: string): string[] {
    return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

export default handler(
    () =>
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
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: Record<string, unknown>,
        ): Promise<{success: boolean; message?: string}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // 1. Process capabilities and their actions first
            if (params.capability) {
                for (const [capabilityName, actionList] of Object.entries(params.capability)) {
                    const actionNames = splitNames(actionList);
                    for (const actionName of actionNames) {
                        const actionId = await ensureResource(
                            qb,
                            actionName,
                            'access.action',
                            'access_action',
                            {description: `${actionName} action`},
                            'actionId',
                        );
                        const capabilityId = await ensureResource(
                            qb,
                            capabilityName,
                            'access.capability',
                            'access_capability',
                            {description: `${capabilityName} capability`},
                            'capabilityId',
                        );
                        await qb('core_triple')
                            .insert({
                                subjectId: uuidBuf(capabilityId),
                                predicateName: 'hasAction',
                                objectId: uuidBuf(actionId),
                            })
                            .onConflict()
                            .ignore();
                    }
                }
            }

            // 2. Process roles and their capabilities
            if (params.role) {
                for (const [roleName, capabilityList] of Object.entries(params.role)) {
                    const capabilityNames = splitNames(capabilityList);
                    const roleId = await ensureResource(
                        qb,
                        roleName,
                        'access.role',
                        'access_role',
                        {roleBit: 0, description: `${roleName} role`},
                        'roleId',
                    );
                    for (const capabilityName of capabilityNames) {
                        const capabilityId = await ensureResource(
                            qb,
                            capabilityName,
                            'access.capability',
                            'access_capability',
                            {description: `${capabilityName} capability`},
                            'capabilityId',
                        );
                        await qb('core_triple')
                            .insert({
                                subjectId: uuidBuf(roleId),
                                predicateName: 'hasCapability',
                                objectId: uuidBuf(capabilityId),
                            })
                            .onConflict()
                            .ignore();
                    }
                }
            }

            // 3. Process users with credentials and role assignments
            if (params.user) {
                for (const [userName, userDef] of Object.entries(params.user)) {
                    const userId = await ensureResource(
                        qb,
                        userName,
                        'access.user',
                        'access_user',
                        {isActive: userDef.isActive ?? 1},
                        'userId',
                    );

                    // Create credential if password is provided
                    if (userDef.password) {
                        const salt = userDef.credentialSalt ?? newUuid();
                        const hash = crypto
                            .pbkdf2Sync(userDef.password, salt, _iterations, _keyLength, _digest)
                            .toString('hex');
                        await qb('access_credential')
                            .insert({
                                userId: uuidBuf(userId),
                                credentialType: 'password',
                                credentialHash: hash,
                                credentialSalt: salt,
                                isActive: userDef.isActive ?? 1,
                            })
                            .onConflict()
                            .ignore();
                    }

                    // Assign roles
                    if (userDef.roles) {
                        const roleNames = splitNames(userDef.roles);
                        for (const roleName of roleNames) {
                            const roleId = await ensureResource(
                                qb,
                                roleName,
                                'access.role',
                                'access_role',
                                {roleBit: 0, description: `${roleName} role`},
                                'roleId',
                            );
                            await qb('core_triple')
                                .insert({
                                    subjectId: uuidBuf(userId),
                                    predicateName: 'hasRole',
                                    objectId: uuidBuf(roleId),
                                })
                                .onConflict()
                                .ignore();
                        }
                    }
                }
            }

            // 4. Refresh materialized paths
            await qb.raw('CALL access_pathRefresh()');

            return {success: true};
        },
);
