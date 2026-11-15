import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import {blobScopeMatch} from '@feasibleone/blong/blob';

import {blobScopesFromRequest} from '../../blob/blobScope.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from './handlerGroup.ts';

/**
 * `blob.head` — the headers a cache needs, and no body.
 *
 * It answers the same headers and the same refusals as `blob.read`, which is what makes a conditional
 * request cheap: the browser learns the `ETag` without a byte of content (@@D-836).
 */
export default handler(({errors, config, handler: {storageBlobHead}, lib: {blobServeAnswer}}) => ({
    async blobHead(params: {namespace: string; key: string}, $meta: IMeta): Promise<null> {
        const settings = blobSettings(config, blobPortConfig(this));
        const meta = (await storageBlobHead(
            {namespace: params.namespace, key: params.key},
            $meta,
        )) as IBlobMeta | null;
        if (!meta) {
            throw errors['blob.notFound']({params: {namespace: params.namespace, key: params.key}});
        }
        const scopes = blobScopesFromRequest($meta, settings.cookie.name, settings.cookie.secret);
        if (!blobScopeMatch(meta, scopes)) {
            throw errors['blob.scopeDenied']({
                params: {namespace: params.namespace, key: params.key},
            });
        }
        const headers = $meta.httpRequest?.headers ?? {};
        const answer = await blobServeAnswer(
            {
                namespace: params.namespace,
                key: params.key,
                ifNoneMatch: headers['if-none-match'] as string | undefined,
            },
            settings.crypto,
            true,
        );
        $meta.httpResponse = {
            code: answer.code,
            type: answer.headers['Content-Type'],
            header: Object.entries(answer.headers).filter(([name]) => name !== 'Content-Type'),
        };
        return null;
    },
}));
