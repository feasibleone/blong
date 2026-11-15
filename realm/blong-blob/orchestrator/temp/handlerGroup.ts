import {handlerGroup} from '@feasibleone/blong';

/**
 * `handler` for the `orchestrator/temp` group.
 *
 * The group holds the one handler a deployment's scheduler calls; its libraries are plain modules, so
 * none are typed here.
 */
export const handler = handlerGroup<Record<string, never>>();
