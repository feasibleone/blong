import {library} from '@feasibleone/blong';

// The knex query builder is untyped here, as in the rest of the adapter's db group.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/** `binary(16)` arrives at a handler as 24 base64 characters. */
const _binary16 = /^[A-Za-z0-9+/]{22}==$/;

/** Accept either the wire form (base64) or a raw buffer. */
function asBinary(value: unknown): unknown {
    return typeof value === 'string' && _binary16.test(value)
        ? Buffer.from(value, 'base64')
        : value;
}

/**
 * The profile kind behind a resource id.
 *
 * A conferral, an attachment and an affiliation all point at any of the five
 * profile objects, so the kind is read from `core_type` instead of being typed by
 * the operator. @@D-598
 */
async function recipientKindOf(qb: KnexQb, resourceId: unknown): Promise<string> {
    const row = (await qb('core_resource')
        .join('core_type', 'core_resource.typeId', 'core_type.typeId')
        .where('core_resource.resourceId', asBinary(resourceId))
        .first('core_type.typeAlias')) as {typeAlias?: string} | undefined;
    const alias = row?.typeAlias ?? '';
    const kind = alias.startsWith('sport.') ? alias.slice('sport.'.length) : '';
    return ['athlete', 'coach', 'specialist', 'club', 'federation'].includes(kind) ? kind : 'other';
}

export default library(() => ({asBinary, recipientKindOf}));
