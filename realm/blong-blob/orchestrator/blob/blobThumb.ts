import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import {blobScopeMatch} from '@feasibleone/blong/blob';
import type {Readable} from 'node:stream';

import {blobScopesFromRequest} from '../../blob/blobScope.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from './handlerGroup.ts';

/** `blob.thumb` — the read route's variant, answered as the same record would be. */
export default handler(({errors, config, handler: {storageBlobHead}, lib: {blobServeAnswer}}) => ({
    async blobThumb(
        params: {namespace: string; key: string},
        $meta: IMeta,
    ): Promise<Readable | null> {
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
        const answer = await blobServeAnswer(
            {namespace: params.namespace, key: params.key, variant: 'thumb'},
            settings.crypto,
        );
        $meta.httpResponse = {
            code: answer.code,
            type: answer.headers['Content-Type'],
            header: Object.entries(answer.headers).filter(([name]) => name !== 'Content-Type'),
        };
        return (answer.stream as Readable) ?? null;
    },
}));
