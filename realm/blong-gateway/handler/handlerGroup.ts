import {handlerGroup} from '@feasibleone/blong';

import type {GatewayUuidLib} from '../adapter/db/gatewayUuid.ts';

/**
 * The libraries the `adapter/db` group injects, as one type.
 */
export type GatewayDbLib = GatewayUuidLib;

/**
 * `handler` for the `adapter/db` group — the framework factory with
 * {@link GatewayDbLib} typed on `lib`, so each handler destructures the members it
 * uses and gets them typed:
 *
 * ```typescript
 * export default handler(({lib: {uuidBuf}}) => async function …)
 * ```
 *
 * This file lives in `handler/` on purpose: the loader auto-discovers layer
 * folders only, so nothing here is loaded as a handler-group member (a plain
 * module inside a group folder makes the loader log an error).
 */
export const handler = handlerGroup<GatewayDbLib>();
