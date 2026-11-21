import {handlerGroup} from '@feasibleone/blong';

import type {ViewerStoreLib} from './store.ts';

/**
 * The libraries the `viewer.log` group injects, as one type.
 *
 * The group's only library is the store (`store.ts`), and naming it here is what
 * makes `lib: {store}` type-check inside a handler: a handler written against
 * the group's `handlerGroup<…>` reads exactly the libraries its folder
 * contributes, and the loader skips this file by name.
 */
export type ViewerLogLib = ViewerStoreLib;

export const handler = handlerGroup<ViewerLogLib>();
