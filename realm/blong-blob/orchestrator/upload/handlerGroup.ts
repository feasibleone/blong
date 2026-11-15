import {handlerGroup} from '@feasibleone/blong';

import type {IBlobLib} from './blobCipher.ts';
import type {IVariantsLib} from './uploadVariants.ts';

/** `handler` for the `orchestrator/upload` group, with its libraries typed. */
export const handler = handlerGroup<IBlobLib & IVariantsLib>();
