import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * Read one language's resource display names.
 *
 * Wire: `core.translation.list` — `{languageCode}` in, `{resourceId: text}` out.
 * The key is the resource id in **base64**, the form a dropdown option carries as
 * its `value` (`{value: base64, label: resourceName}`), so the client can map an
 * option without converting anything (`D-635`).
 *
 * A resource with no row of its own is absent rather than empty: the client
 * falls back to the option's own `resourceName`.
 */
export default handler(
    () =>
        async function coreTranslationList(
            params: {languageCode?: string},
            $meta: IMeta,
        ): Promise<Record<string, string>> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) return {};
            const languageCode = String(
                params?.languageCode ?? $meta?.language?.languageId ?? '',
            ).trim();
            if (!languageCode) return {};

            const rows = (await qb('core_translation')
                .where({languageCode})
                .select('resourceId', 'translatedName')) as Array<{
                resourceId: Buffer | string;
                translatedName: string;
            }>;

            const dictionary: Record<string, string> = {};
            for (const row of rows) {
                if (!row.translatedName) continue;
                const id =
                    typeof row.resourceId === 'string'
                        ? row.resourceId
                        : Buffer.from(row.resourceId).toString('base64');
                dictionary[id] = row.translatedName;
            }
            return dictionary;
        },
);
