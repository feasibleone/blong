import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `core.translation.edit` — stamps the editor before the generic update, so a
 * corrected resource name outlives the seed that seeded it (`D-626`).
 */
export default handler(({lib: {editorStamp}}: {lib: {editorStamp: (meta: unknown) => object}}) => ({
    async coreTranslationEdit(
        params: {translation?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const translation = {...(params.translation ?? {}), ...editorStamp($meta)};
        return super.exec({...params, translation}, $meta);
    },
}));
