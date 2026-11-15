import {handlerGroup} from '@feasibleone/blong';

/** `handler` for the `orchestrator/storage` group. Its libraries are plain modules, so none are typed. */
export const handler = handlerGroup<Record<string, never>>();
