import {library} from '@feasibleone/blong';
import {planTemplate, withMarker} from '../../engine.ts';
import {
    baseResult,
    contextOf,
    descriptorFor,
    REALM_TEMPLATE_ROOT,
    type KukumLibContext,
    type OperationParams,
    type OperationResult,
} from '../../operation.ts';

/** `kukum.<primitive>.get` — the file set a primitive *would* produce, without writing. */
export default library(
    () =>
        async function get(
            this: KukumLibContext,
            id: string,
            params: OperationParams,
        ): Promise<OperationResult> {
            const host = this.platform;
            const root = host.resolve(params.target ?? '.');
            const descriptor = descriptorFor(id);
            const ctx = contextOf(id, params);
            const base = baseResult(id, 'get', ctx);
            // Mirrors `add`: for a realm the real answer is the template's file set, not
            // the minimal fallback descriptor.
            if (id === 'realm' && host.existsSync(host.join(REALM_TEMPLATE_ROOT, 'package.json'))) {
                const template = await planTemplate(host, {
                    templateRoot: REALM_TEMPLATE_ROOT,
                    root,
                    subject: ctx.subject,
                    object: ctx.object,
                    instructions: params.instructions ?? [],
                });
                return {
                    ...base,
                    files: template.map(change => ({
                        path: change.path,
                        content: '',
                        action: 'template',
                        handWritten: false,
                    })),
                    messages: [
                        `${descriptor.title} — scaffolded from the blong-kopi template`,
                        `Skill: ${descriptor.skill}`,
                        descriptor.summary,
                    ],
                };
            }
            const files = descriptor.files(ctx).map(file => ({
                path: file.path,
                content: withMarker(file.content),
                action: 'template',
                handWritten: false,
            }));
            return {
                ...base,
                files,
                messages: [
                    `${descriptor.title} (kinds: ${descriptor.kinds.join(', ')})`,
                    `Skill: ${descriptor.skill}`,
                    descriptor.summary,
                ],
            };
        },
);
