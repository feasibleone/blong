import {library} from '@feasibleone/blong';
import {find as findInstances} from '../../engine.ts';
import {
    baseResult,
    contextOf,
    descriptorFor,
    type KukumLibContext,
    type OperationParams,
    type OperationResult,
} from '../../operation.ts';

/** `kukum.<primitive>.find` — the existing artifacts of a primitive, read from disk. */
export default library(
    () =>
        async function find(
            this: KukumLibContext,
            id: string,
            params: OperationParams,
        ): Promise<OperationResult> {
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            const descriptor = descriptorFor(id);
            const base = baseResult(id, 'find', contextOf(id, params));
            const instances = await findInstances(host, descriptor, root);
            return {
                ...base,
                files: instances.map(path => ({
                    path,
                    content: '',
                    action: 'existing',
                    handWritten: false,
                })),
            };
        },
);
