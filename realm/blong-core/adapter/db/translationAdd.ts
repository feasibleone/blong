import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `core.translation.add` — stamps the editor on a resource translation created
 * through the editor page (`D-626`).
 */
export default handler(({lib: {editorStamp}}: {lib: {editorStamp: (meta: unknown) => object}}) => ({
    async coreTranslationAdd(
        params: {translation?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const translation = {...(params.translation ?? {}), ...editorStamp($meta)};
        return super.exec({...params, translation}, $meta);
    },
}));
