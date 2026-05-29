/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 */
import type { IModelSpec, IResolvedModelSpec } from '@feasibleone/blong';
type DeepMerge<T, U> = T extends object ? U extends object ? {
    [K in keyof T | keyof U]: K extends keyof T ? K extends keyof U ? DeepMerge<T[K], U[K]> : T[K] : K extends keyof U ? U[K] : never;
} : U : U;
type DeepMergeAll<Ts extends readonly unknown[]> = Ts extends readonly [infer Head, ...infer Tail] ? Tail extends readonly [] ? Head : DeepMerge<Head, DeepMergeAll<Tail>> : unknown;
/**
 * Merge source into target deeply, returning a new object.
 * Only plain objects are merged; arrays and primitives are overwritten.
 */
export declare function deepMerge<T extends object[]>(...args: T): DeepMergeAll<T>;
/**
 * Apply standard defaults to a partial ModelSpec.
 *
 * @param spec - Partial model spec provided by the realm
 * @returns Fully resolved model spec with all defaults filled in
 */
export declare function withDefaults(spec: IModelSpec): IResolvedModelSpec;
export {};
