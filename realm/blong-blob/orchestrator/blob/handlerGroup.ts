import {handlerGroup} from '@feasibleone/blong';

import type {IBlobLib} from './blobCipher.ts';

/** `handler` for the `orchestrator/blob` group, with its libraries typed. */
export const handler = handlerGroup<IBlobLib>();
