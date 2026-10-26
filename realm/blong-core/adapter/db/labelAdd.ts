import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `core.label.add` — stamps the editor on a label a person creates.
 *
 * The write itself is the generic CRUD, reached through `super.exec`: the
 * override exists only because the payload cannot know who is writing, and the
 * seed merge needs that answer to decide what it may replace (`D-626`).
 */
export default handler(({lib: {editorStamp}}: {lib: {editorStamp: (meta: unknown) => object}}) => ({
    async coreLabelAdd(
        params: {label?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const label = {...(params.label ?? {}), ...editorStamp($meta)};
        return super.exec({...params, label}, $meta);
    },
}));
