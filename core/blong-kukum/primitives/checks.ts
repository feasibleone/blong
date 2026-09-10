import type {PrimitiveContext} from '../engine.ts';
import {layerOf} from './shared.ts';

/** The checks several descriptors share before they generate anything. */

/** Standard predicate priority — never invent one that already exists. */
export const STANDARD_PREDICATES = [
    'get',
    'find',
    'add',
    'edit',
    'remove',
    'merge',
    'insert',
    'update',
    'delete',
    'list',
    'create',
    'check',
    'refresh',
    'start',
    'stop',
];

/** Reject a layer the descriptor is not allowed to write into. */
export function checkLayer(ctx: PrimitiveContext, allowed: string[]): string[] {
    const layer = layerOf(ctx, allowed[0]);
    return allowed.includes(layer)
        ? []
        : [`layer '${layer}' must be one of: ${allowed.join(', ')}`];
}
