import {library} from '@feasibleone/blong';
import {apply, plan, planTemplate} from '../../engine.ts';
import {
    baseResult,
    collectWarnings,
    contextOf,
    descriptorFor,
    diagnose,
    REALM_TEMPLATE_ROOT,
    toResultFile,
    type KukumLibContext,
    type OperationParams,
    type OperationResult,
} from '../../operation.ts';

/**
 * `kukum.<primitive>.add` — scaffold a primitive.
 *
 * One file serves all fourteen primitives: the file name is the part of the
 * endpoint path that differs — the predicate — and the primitive id is an
 * argument. The platform is read off `this` because that is where the runtime
 * put it, never captured in the factory.
 */
export default library(
    () =>
        async function add(
            this: KukumLibContext,
            id: string,
            params: OperationParams,
        ): Promise<OperationResult> {
            const host = this.platform;
            const descriptor = descriptorFor(id);
            const root = host.resolve(params.target ?? '.');
            const ctx = contextOf(id, params);
            const base = baseResult(id, 'add', ctx);
            const messages = [...(descriptor.check?.(ctx) ?? [])];
            if (messages.length) throw new Error(messages.join('; '));
            // A realm is the one primitive whose value is the whole canonical tree, so
            // prefer the real template over the minimal descriptor set.
            const useTemplate =
                id === 'realm' && host.existsSync(host.join(REALM_TEMPLATE_ROOT, 'package.json'));
            const changes = useTemplate
                ? await planTemplate(host, {
                      templateRoot: REALM_TEMPLATE_ROOT,
                      root,
                      subject: ctx.subject,
                      object: ctx.object,
                      instructions: params.instructions ?? [],
                  })
                : plan(host, descriptor, {
                      root,
                      context: ctx,
                      instructions: params.instructions ?? [],
                      mode: params.mode ?? 'auto',
                  });
            if (!params.dryRun) {
                const {written, skipped} = apply(host, changes, {force: params.force});
                base.written = written;
                base.skipped = skipped;
                const diagnostics = await diagnose(host, root, written);
                return {
                    ...base,
                    files: changes.map(toResultFile),
                    messages: [...messages, ...changes.flatMap(change => change.notices ?? [])],
                    diagnostics,
                    warnings: collectWarnings(id, changes, {
                        applied: true,
                        force: params.force,
                    }).concat(
                        skipped.map(
                            path =>
                                `${path} was left alone: it is hand-written (pass force to overwrite)`,
                        ),
                    ),
                };
            }
            return {
                ...base,
                files: changes.map(toResultFile),
                messages,
                warnings: collectWarnings(id, changes, {
                    applied: false,
                    force: params.force,
                }),
            };
        },
);
