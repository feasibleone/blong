import {handlerGroup} from '@feasibleone/blong';

import type {FeedbackLib} from './core.ts';
import type {ProseLib} from './prose.ts';

/**
 * The libraries the `feedback.db` group injects, as one type.
 *
 * Two `library()` files contribute to one lib object at runtime — `core.ts` for
 * the identity helpers and `prose.ts` for the renderer — so the type a handler
 * sees is their intersection.
 *
 * This file sits in the handler-group folder on purpose and the loader skips it
 * by name: it exports the factory its siblings import, so it is neither a handler
 * nor a plain module in a group (`@@T-469`).
 */
export type FeedbackDbLib = FeedbackLib & ProseLib;

export const handler = handlerGroup<FeedbackDbLib>();
