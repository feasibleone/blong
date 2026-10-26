import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * Read one language's UI-label dictionary.
 *
 * Wire: `core.label.list` — `{languageCode}` in, `{labelKey: labelText}` out,
 * sorted by key for a stable diff in a debug dump. The language falls back to
 * the request's own (`$meta.language.languageId`, set from the token), which is
 * what makes a plain signed-in call the user's language.
 *
 * Empty rows are skipped: an empty `labelText` is a not-translated-yet marker
 * (`D-631`), and returning it as `''` would answer "translated to nothing"
 * whereas the client wants its English fallback.
 */
export default handler(
    () =>
        async function coreLabelList(
            params: {languageCode?: string},
            $meta: IMeta,
        ): Promise<Record<string, string>> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) return {};
            const languageCode = String(
                params?.languageCode ?? $meta?.language?.languageId ?? '',
            ).trim();
            if (!languageCode) return {};

            const rows = (await qb('core_label')
                .where({languageCode})
                .select('labelKey', 'labelText')
                .orderBy('labelKey')) as Array<{labelKey: string; labelText: string}>;

            const dictionary: Record<string, string> = {};
            for (const row of rows) {
                if (row.labelText) dictionary[row.labelKey] = row.labelText;
            }
            return dictionary;
        },
);
