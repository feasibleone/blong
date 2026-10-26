/* spell-checker: disable */
import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * Merge a resource-translation seed into `core_translation`.
 *
 * Wire: `core.translation.seed` — a `meta/db/*-coreTranslationSeed.yaml`
 * asset, one language per file. A line names the resource by its type alias and
 * its resource name, because the resource id is minted per database:
 *
 *     sport.sport|Athletics=Лека атлетика
 *
 * The first `|` separates the two (`keyParser`), the first `=` the text. A name
 * that resolves to no resource is reported and skipped rather than failing the
 * whole seed: a seed file is shared by databases whose resource sets differ.
 *
 * Ownership is the same rule as the label merge (`D-626`, T-291).
 */
export default handler(
    ({lib: {parseSeedLines, seedActor, uuidBuf}}) => ({
        async coreTranslationSeed(
            params: {languageCode?: string; translation?: string},
            $meta: IMeta,
        ): Promise<{
            inserted: number;
            updated: number;
            unchanged: number;
            skipped: number;
            missing: number;
        }> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const languageCode = String(params?.languageCode ?? '').trim();
            if (!languageCode) throw new Error('core.translation.seed needs a languageCode');

            const pairs = parseSeedLines(params?.translation, raw => {
                const at = raw.indexOf('|');
                if (at < 0) return undefined;
                const qualifier = raw.slice(0, at).trim();
                const key = raw.slice(at + 1).trim();
                return qualifier && key ? {key, qualifier} : undefined;
            });
            const actor = uuidBuf(await seedActor(qb));
            const now = new Date();
            let inserted = 0;
            let updated = 0;
            let unchanged = 0;
            let skipped = 0;
            let missing = 0;
            const unknown: string[] = [];

            for (const {key: resourceName, value: translatedName, qualifier} of pairs) {
                const resource = await qb
                    .select('r.resourceId')
                    .from('core_resource as r')
                    .join('core_type as t', 't.typeId', 'r.typeId')
                    .where('t.typeAlias', qualifier)
                    .where('r.resourceName', resourceName)
                    .first();
                if (!resource) {
                    missing++;
                    if (unknown.length < 5) unknown.push(`${qualifier}|${resourceName}`);
                    continue;
                }
                const resourceId = Buffer.from(resource.resourceId);

                const existing = await qb('core_translation')
                    .where({resourceId, languageCode})
                    .first('translationId', 'translatedName', 'editorId');

                if (!existing) {
                    await qb('core_translation')
                        .insert({
                            resourceId,
                            languageCode,
                            translatedName,
                            editorId: actor,
                            editedAt: now,
                        })
                        .onConflict(['resourceId', 'languageCode'])
                        .ignore();
                    inserted++;
                    continue;
                }

                const owned = !existing.editorId || Buffer.from(existing.editorId).equals(actor);
                if (!owned) {
                    skipped++;
                    continue;
                }
                if (existing.translatedName === translatedName) {
                    unchanged++;
                    continue;
                }
                await qb('core_translation')
                    .where({translationId: existing.translationId})
                    .update({translatedName, editorId: actor, editedAt: now});
                updated++;
            }

            if (skipped || missing) {
                this.log?.warn?.({
                    $meta: {mtid: 'event', method: 'core.translation.seed'},
                    message:
                        `core.translation.seed ${languageCode}: kept ${skipped} hand-edited, ` +
                        `skipped ${missing} unknown resource(s)` +
                        (unknown.length ? ` e.g. ${unknown.join(', ')}` : ''),
                });
            }

            return {inserted, updated, unchanged, skipped, missing};
        },
    }),
);

/* spell-checker: enable */
