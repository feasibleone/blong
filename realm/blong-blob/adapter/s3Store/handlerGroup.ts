import {handlerGroup} from '@feasibleone/blong';

import type {IS3StoreLib} from './s3StoreLib.ts';

/** `handler` for the `adapter/s3` group, with its libraries typed. */
export const handler = handlerGroup<IS3StoreLib>();
