import {handlerGroup} from '@feasibleone/blong';

import type {IStorageLib} from './storageLib.ts';

/** `handler` for the `adapter/storage` group, with its libraries typed. */
export const handler = handlerGroup<IStorageLib>();
