/**
 * Model defaults — fills in standard values for unspecified ModelSpec fields.
 *
 * The interesting part is what a *declaration* implies. A model names its parent
 * once and gets the navigator, the tree and the cascade from it; names nothing
 * and is a plain table. A model never names its sort and is ordered by its name
 * column, because a paged table that is unordered can show a row twice and lose
 * another between pages.
 */
import type { IModelSpec, IResolvedModelSpec } from '@feasibleone/blong';
/**
 * Apply standard defaults to a partial ModelSpec.
 *
 * @param spec - Partial model spec provided by the realm
 * @returns Fully resolved model spec with all defaults filled in
 */
export declare function withDefaults(spec: IModelSpec): IResolvedModelSpec;
/**
 * Everything a resolved model promises but does not state.
 *
 * Two of these are silent otherwise, and both cost the reader: a browse table is
 * always paged, so a page with no order may show a row twice and lose another
 * between two pages, and a navigator with nothing to list is a fifth of the page
 * spent on an empty panel. The aggregator logs what comes back here once, when
 * the pages are built.
 */
export declare function modelWarnings(model: IResolvedModelSpec): string[];
