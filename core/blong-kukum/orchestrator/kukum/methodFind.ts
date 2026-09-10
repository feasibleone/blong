import {library} from '@feasibleone/blong';
import type {KukumLibContext} from '../../operation.ts';

/**
 * `kukum.method.find` — the method groups the runtime actually wired up.
 *
 * Reads the live registry off `this`, so it reports what this process mounted
 * rather than what the source says.
 */
export default library(
    () =>
        function methodFind(this: KukumLibContext, _params?: unknown) {
            const description = this.registry?.describe?.();
            if (!description) return {available: false as const};
            return {
                available: true as const,
                groups: description.groups,
                folders: description.folders,
                files: description.files,
            };
        },
);
