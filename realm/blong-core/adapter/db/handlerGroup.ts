import {handlerGroup} from '@feasibleone/blong';

import type {CoreLib} from './core.ts';

/**
 * The libraries the `adapter/db` group injects, as one type.
 */
export type CoreDbLib = CoreLib;

/**
 * `handler` for the `adapter/db` group — the framework factory with
 * {@link CoreDbLib} typed on `lib`, so each handler destructures the members it
 * uses and gets them typed:
 *
 * ```typescript
 * export default handler(({lib: {uuidBuf}}) => async function …)
 * ```
 *
 * This file sits in the handler-group folder on purpose, and the loader skips it
 * by name: `handlerGroup.ts` is a plain module (it exports the factory its
 * siblings import), so it is neither loaded as a handler nor reported as a plain
 * module in a group.
 */
export const handler = handlerGroup<CoreDbLib>();
