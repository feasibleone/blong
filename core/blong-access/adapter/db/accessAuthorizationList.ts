import {type IMeta, handler} from '@feasibleone/blong';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
    actions: Set<string>;
    timestamp: number;
}

// ---------------------------------------------------------------------------
// Module-level cache: roleBit → {action names, timestamp}
// ---------------------------------------------------------------------------

const _actionCache = new Map<number, CacheEntry>();
let _cacheTtl = 30_000; // 30 000 ms = 30 seconds default
let _lastCleanup = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a Buffer (or JSON-deserialized Buffer object) into the list of set bit
 * positions.  Each set bit corresponds to a `roleBit` value in `access_role`.
 *
 * Handles both native Buffer and the JSON-deserialized form
 * `{type: 'Buffer', data: number[]}` that arrives over HTTP/MLE transport.
 */
function getSetBits(input: Buffer | {type: 'Buffer'; data: number[]}): number[] {
    const data: number[] = Buffer.isBuffer(input)
        ? [...input]
        : Array.isArray((input as {data?: number[]})?.data)
          ? (input as {data: number[]}).data
          : [];
    const bits: number[] = [];
    for (let byteIndex = 0; byteIndex < data.length; byteIndex++) {
        const byte = data[byteIndex];
        if (byte === 0) continue;
        for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
            if (byte & (1 << bitIndex)) {
                bits.push(byteIndex * 8 + bitIndex);
            }
        }
    }
    return bits;
}

/**
 * Normalise an action resource name to a methodId:
 * lowercase, dots removed.
 */
const _methodId = (name: string): string => name.toLowerCase().replaceAll('.', '');

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default handler(
    () =>
        async function accessAuthorizationList(
            params: {permissionMap: Buffer; ttl?: number},
            _$meta: IMeta,
        ): Promise<string[]> {
            const qb: any = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // Allow caller to override TTL
            if (typeof params.ttl === 'number' && params.ttl > 0) {
                _cacheTtl = params.ttl;
            }

            // Periodic cache cleanup
            const now = Date.now();
            if (now - _lastCleanup > _cacheTtl * 2) {
                for (const [key, entry] of _actionCache) {
                    if (now - entry.timestamp > _cacheTtl) _actionCache.delete(key);
                }
                _lastCleanup = now;
            }

            // Decode which role bits are set in the permissionMap bitmask
            const setBits = getSetBits(params.permissionMap);
            if (setBits.length === 0) return [];

            // Separate cached vs uncached role bits
            const uncachedBits: number[] = [];
            const result: string[] = [];

            for (const bit of setBits) {
                const cached = _actionCache.get(bit);
                if (cached && now - cached.timestamp < _cacheTtl) {
                    for (const action of cached.actions) result.push(action);
                } else {
                    uncachedBits.push(bit);
                }
            }

            // Fetch uncached role→action mappings from DB
            if (uncachedBits.length > 0) {
                const rows: Array<{roleBit: number; resourceName: string}> = await qb
                    .select('r.roleBit', 'cr.resourceName')
                    .from('access_role as r')
                    .join('core_triple as t1', function (this: any) {
                        this.on('t1.subjectId', 'r.roleId').andOnVal(
                            't1.predicateName',
                            'hasCapability',
                        );
                    })
                    .join('core_triple as t2', function (this: any) {
                        this.on('t2.subjectId', 't1.objectId').andOnVal(
                            't2.predicateName',
                            'hasAction',
                        );
                    })
                    .join('core_resource as cr', 'cr.resourceId', 't2.objectId')
                    .whereIn('r.roleBit', uncachedBits)
                    .distinct('cr.resourceName');

                // Group actions by roleBit
                const bitGroups = new Map<number, Set<string>>();
                for (const row of rows) {
                    let group = bitGroups.get(row.roleBit);
                    if (!group) {
                        group = new Set<string>();
                        bitGroups.set(row.roleBit, group);
                    }
                    group.add(row.resourceName);
                }

                // Update cache and collect results
                for (const bit of uncachedBits) {
                    const group = bitGroups.get(bit);
                    const actionSet = group ?? new Set<string>();
                    _actionCache.set(bit, {actions: actionSet, timestamp: now});
                    for (const a of actionSet) result.push(a);
                }
            }

            // Deduplicate and normalise to methodId format
            return [...new Set(result)].map(_methodId);
        },
);
