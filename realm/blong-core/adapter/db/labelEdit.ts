import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `core.label.edit` — stamps the editor before the generic update.
 *
 * A hand-corrected translation is owned by the person who corrected it, so a
 * later seed run keeps it instead of replacing it (`D-626`, T-291).
 */
export default handler(({lib: {editorStamp}}: {lib: {editorStamp: (meta: unknown) => object}}) => ({
    async coreLabelEdit(
        params: {label?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const label = {...(params.label ?? {}), ...editorStamp($meta)};
        return super.exec({...params, label}, $meta);
    },
}));
