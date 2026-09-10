import {library} from '@feasibleone/blong';
import {readSource} from '../../engine.ts';
import type {KukumLibContext, OperationParams} from '../../operation.ts';

/**
 * `kukum.source.get` — a file's source plus its embedded agent instructions.
 *
 * `generated` reports whether the file carries kukum's marker, which is what the
 * merge engine keys on.
 */
export default library(
    () =>
        function sourceGet(this: KukumLibContext, params: OperationParams) {
            if (!params.path) throw new Error('source.get requires a `path`');
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            return readSource(host, root, params.path);
        },
);
