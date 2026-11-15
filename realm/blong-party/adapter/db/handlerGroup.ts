import {handlerGroup} from '@feasibleone/blong';

/**
 * `handler` for the `adapter/db` group.
 *
 * Party's CRUD comes from the model system, so this group holds only the queries a model cannot
 * express — the graph walks that answer a question about relations (@@D-836). Its libraries are plain
 * modules, so none are typed here.
 */
export const handler = handlerGroup<Record<string, never>>();
