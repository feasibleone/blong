import {capitalize, type PrimitiveContext} from '../engine.ts';

/**
 * Small helpers shared by several descriptors.
 *
 * These are deliberately dependency-free: they are the leaf of the catalogue's
 * import graph, so every descriptor can reach them without pulling in another
 * descriptor.
 */

/** The layer a descriptor targets, defaulting to the caller's suggestion. */
export const layerOf = (ctx: PrimitiveContext, fallback: string): string => ctx.layer ?? fallback;

/** The handler group a descriptor targets, defaulting to the subject. */
export const groupOf = (ctx: PrimitiveContext): string => ctx.group ?? ctx.subject;

/**
 * The stable name of the first row a generated seed declares.
 *
 * Shared by the seed and the Playwright spec on purpose: the browse screenshot
 * filters on it, so the two drifting apart would silently produce a baseline
 * that captures whatever else happens to be in the table.
 */
export const seedRowName = (object: string): string => `Sample ${capitalize(object)} One`;
