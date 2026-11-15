import type {IMeta} from '@feasibleone/blong';
import type {Readable} from 'node:stream';

import type {IBlobMeta} from '@feasibleone/blong';
import {blobScopeMatch} from '@feasibleone/blong/blob';
import {blobScopesFromRequest} from '../../blob/blobScope.ts';

import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from './handlerGroup.ts';

/**
 * `blob.read` — the bytes of one blob, for a browser that holds the scope cookie.
 *
 * The cookie is the whole authorisation here: it is verified in-process, so a read never opens a
 * database connection (@@D-837). A blob whose scopes are `anonymous` is served with no cookie at all,
 * which is what makes a login page's own images reachable.
 */
export default handler(({errors, config, handler: {storageBlobHead}, lib: {blobServeAnswer}}) => ({
    async blobRead(
        params: {
            namespace: string;
            key: string;
            download?: string;
            variant?: string;
        },
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

        const headers = $meta.httpRequest?.headers ?? {};
        const answer = await blobServeAnswer(
            {
                namespace: params.namespace,
                key: params.key,
                variant: params.variant,
                download: params.download !== undefined && params.download !== '0',
                range: headers['range'] as string | undefined,
                ifNoneMatch: headers['if-none-match'] as string | undefined,
            },
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
