/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 */
import type { IModelSpec, IResolvedModelSpec } from '@feasibleone/blong';
/**
 * Apply standard defaults to a partial ModelSpec.
 *
 * @param spec - Partial model spec provided by the realm
 * @returns Fully resolved model spec with all defaults filled in
 */
export declare function withDefaults(spec: IModelSpec): IResolvedModelSpec;
