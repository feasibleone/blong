import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * Merge a UI-label seed into `core_label`.
 *
 * Wire: `core.label.seed` — a `meta/db/*-coreLabelSeed.yaml` asset, one
 * language per file, pairs as `Key=Value` lines in a YAML block scalar. The
 * asset loader dispatches the document here, so the filename must end in
 * `-coreLabelSeed` (`bg-coreLabelSeed.yaml`).
 *
 * Ownership (`D-626`, T-291): a row the database holds is replaced only when
 * nobody has edited it — `editorId` is null — or when the last editor is the
 * seed actor. A row a user corrected through the editor pages is kept and
 * counted as skipped, so a production seed never overwrites a translation
 * somebody fixed by hand.
 *
 * A line without a value is the collector's TODO marker (`D-631`): it is
 * skipped and never written, so the UI keeps the English fallback.
 */
export default handler(
    ({lib: {parseSeedLines, seedActor, uuidBuf}}) => ({
        async coreLabelSeed(
            params: {languageCode?: string; label?: string},
            $meta: IMeta,
        ): Promise<{inserted: number; updated: number; unchanged: number; skipped: number}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const languageCode = String(params?.languageCode ?? '').trim();
            if (!languageCode) throw new Error('core.label.seed needs a languageCode');

            const pairs = parseSeedLines(params?.label);
            const actor = uuidBuf(await seedActor(qb));
            const now = new Date();
            let inserted = 0;
            let updated = 0;
            let unchanged = 0;
            let skipped = 0;

            for (const {key: labelKey, value: labelText} of pairs) {
                const existing = await qb('core_label')
                    .where({labelKey, languageCode})
                    .first('labelId', 'labelText', 'editorId');

                if (!existing) {
                    // `ignore` rather than `merge`: a concurrent start may be
                    // inserting the same pair, and the loser must not overwrite.
                    await qb('core_label')
                        .insert({labelKey, languageCode, labelText, editorId: actor, editedAt: now})
                        .onConflict(['labelKey', 'languageCode'])
                        .ignore();
                    inserted++;
                    continue;
                }

                const owned = !existing.editorId || Buffer.from(existing.editorId).equals(actor);
                if (!owned) {
                    skipped++;
                    continue;
                }
                if (existing.labelText === labelText) {
                    unchanged++;
                    continue;
                }
                await qb('core_label')
                    .where({labelId: existing.labelId})
                    .update({labelText, editorId: actor, editedAt: now});
                updated++;
            }

            if (skipped) {
                this.log?.warn?.({
                    $meta: {mtid: 'event', method: 'core.label.seed'},
                    message: `core.label.seed kept ${skipped} hand-edited ${languageCode} label(s) and replaced the rest`,
                });
            }

            return {inserted, updated, unchanged, skipped};
        },
    }),
);
