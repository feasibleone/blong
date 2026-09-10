import {library} from '@feasibleone/blong';
import {
    apply,
    applyInstructions,
    extractInstructions,
    readSource,
    withMarker,
} from '../../engine.ts';
import {
    baseResult,
    contextOf,
    diagnose,
    toResultFile,
    type KukumLibContext,
    type OperationParams,
    type OperationResult,
} from '../../operation.ts';

/** `kukum.<primitive>.edit` — rewrite one file, preserving its agent instructions. */
export default library(
    () =>
        async function edit(
            this: KukumLibContext,
            id: string,
            params: OperationParams,
        ): Promise<OperationResult> {
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            const base = baseResult(id, 'edit', contextOf(id, params));
            if (!params.path) throw new Error('edit requires a `path`');
            const existing = readSource(host, root, params.path);
            const instructions = params.instructions ?? extractInstructions(existing.source);
            const content = withMarker(
                params.content ?? applyInstructions(existing.source, instructions),
            );
            const changes = [
                {
                    path: params.path,
                    absolute: host.join(root, params.path),
                    content,
                    action: existing.source === content ? 'unchanged' : 'overwrite',
                    generated: existing.generated,
                    handWritten: !existing.generated,
                } as const,
            ];
            if (!params.dryRun) {
                const {written, skipped} = apply(host, [...changes], {force: params.force});
                base.written = written;
                base.skipped = skipped;
                const diagnostics = await diagnose(host, root, written);
                return {...base, files: changes.map(toResultFile), diagnostics};
            }
            return {...base, files: changes.map(toResultFile)};
        },
);
