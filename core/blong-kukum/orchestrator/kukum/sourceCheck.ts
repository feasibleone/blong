import {library} from '@feasibleone/blong';
import {diagnoseFor, type KukumLibContext, type OperationParams} from '../../operation.ts';

/**
 * `kukum.source.check` — lint given files, or the whole target package.
 *
 * Naming files scopes the run to them; naming none lints the package, which is
 * the cheap "did I break anything" question after a scaffold.
 */
export default library(
    () =>
        async function sourceCheck(this: KukumLibContext, params: OperationParams) {
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            const files = params.files?.length
                ? params.files
                : params.path
                  ? [params.path]
                  : ['**/*.ts', '**/*.tsx', '**/*.md'];
            const scoped = params.files?.length || params.path;
            const diagnostics = await diagnoseFor(
                host,
                root,
                files,
                scoped ? 'changed' : 'package',
            );
            return {target: root, files, diagnostics};
        },
);
