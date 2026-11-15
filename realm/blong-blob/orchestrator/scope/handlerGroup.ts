import {handlerGroup} from '@feasibleone/blong';

/** `handler` for the `orchestrator/scope` group. Its libraries are plain modules, so none are typed. */
export const handler = handlerGroup<Record<string, never>>();
