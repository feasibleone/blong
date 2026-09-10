import {library} from '@feasibleone/blong';
import {find as findInstances} from '../../engine.ts';
import {
    baseResult,
    contextOf,
    descriptorFor,
    diagnose,
    type KukumLibContext,
    type OperationParams,
    type OperationResult,
} from '../../operation.ts';

/** `kukum.<primitive>.check` — validate inputs and lint what the primitive produced. */
export default library(
    () =>
        async function check(
            this: KukumLibContext,
            id: string,
            params: OperationParams,
        ): Promise<OperationResult> {
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            const descriptor = descriptorFor(id);
            const ctx = contextOf(id, params);
            const base = baseResult(id, 'check', ctx);
            const messages = [...(descriptor.check?.(ctx) ?? [])];
            const instances = await findInstances(host, descriptor, root);
            const diagnostics = await diagnose(host, root, instances);
            return {...base, messages, diagnostics};
        },
);
