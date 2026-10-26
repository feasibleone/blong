/* spell-checker: disable */
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * The language code this run writes under.
 *
 * A code of its own, not a fixed `zz`: the flow ends with a hand-edited row that a
 * seed must *not* overwrite, so a fixed code made the second run of the suite meet
 * the first run's leftovers and fail on its own history. The suffix keeps the code
 * inside the column's ten characters, and the last step deletes what it wrote.
 */
const RUN_LANGUAGE = `zz${Date.now().toString(36).slice(-6)}`;

/**
 * server/test/test/testTranslationFlow.ts — the translation storage contract.
 *
 * Proves, against a real database:
 *
 * 1. `core.label.seed` writes a seed block and skips its TODO markers.
 * 2. `core.label.list` answers a dictionary for one language only, without the
 *    untranslated rows.
 * 3. A re-run of the same seed is idempotent: an unchanged pair is counted, not
 *    rewritten.
 * 4. A row a person edited (`core.label.edit` stamps `editorId` from the
 *    caller) survives the next seed run, which counts it as skipped — the
 *    ownership rule of `D-626` / T-291.
 * 5. The resource half works the same way, keyed by type alias plus resource
 *    name, and its list is keyed by the base64 resource id a dropdown option
 *    carries.
 *
 * Registered as the `test.translation.flow` group (`integration.watch.test` in
 * index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            coreLabelSeed,
            coreLabelList,
            coreLabelFind,
            coreLabelEdit,
            coreLabelDelete,
            coreResourceEnsure,
            coreTranslationSeed,
            coreTranslationList,
            coreTranslationFind,
            coreTranslationDelete,
            coreDropdownList,
        },
    }) => ({
        testTranslationFlow: ({name = 'translation flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Seed two pairs plus a TODO marker and a malformed line.
                async function seedLabels(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await coreLabelSeed<{
                        inserted: number;
                        updated: number;
                        unchanged: number;
                        skipped: number;
                    }>(
                        {
                            languageCode: RUN_LANGUAGE,
                            label: [
                                'Save=Запази',
                                'Edit=Редактирай',
                                // A TODO marker the collector writes — skipped.
                                'Browse=',
                                // Not a pair at all — ignored.
                                'no separator here',
                            ].join('\n'),
                        },
                        $meta,
                    );
                    assert.equal(result.inserted, 2, 'two pairs are inserted');
                    assert.equal(result.skipped, 0, 'nothing is skipped on a first run');
                    return result;
                },

                // 2. The dictionary holds the translated pairs and nothing else.
                async function listLabels(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const dictionary = await coreLabelList<Record<string, string>>(
                        {languageCode: RUN_LANGUAGE},
                        $meta,
                    );
                    assert.equal(dictionary.Save, 'Запази', 'a translated pair is returned');
                    assert.equal(dictionary.Edit, 'Редактирай', 'the second pair is returned');
                    assert.equal('Browse' in dictionary, false, 'a TODO marker is not returned');
                    return dictionary;
                },

                // 3. Re-applying the same seed changes nothing.
                async function reseedLabels(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await coreLabelSeed<{
                        inserted: number;
                        updated: number;
                        unchanged: number;
                        skipped: number;
                    }>(
                        {
                            languageCode: RUN_LANGUAGE,
                            label: ['Save=Запази', 'Edit=Редактирай'].join('\n'),
                        },
                        $meta,
                    );
                    assert.equal(result.inserted, 0, 'a re-run inserts nothing');
                    assert.equal(result.updated, 0, 'a re-run updates nothing');
                    assert.equal(result.unchanged, 2, 'both pairs are recognised as unchanged');
                    return result;
                },

                // 4. A hand edit is owned by its author and survives the seed.
                async function editThenReseed(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const rows = await coreLabelFind<Array<{labelId: number; labelKey: string}>>(
                        {
                            filterBy: {languageCode: RUN_LANGUAGE, labelKey: 'Save'},
                            paging: {pageNumber: 1, pageSize: 10},
                        },
                        $meta,
                    );
                    assert.equal(rows.length, 1, 'the seeded row is found');
                    const labelId = rows[0].labelId;

                    // The editor is the access user's resource id; the test stands
                    // in for one with a bare resource, which is what the FK needs.
                    const {resourceId: editorId} = await coreResourceEnsure<{
                        resourceId: string;
                    }>({name: 'TRANSLATION-TEST-EDITOR', typeAlias: 'core.test.actor'}, $meta);

                    await coreLabelEdit(
                        {label: {labelId, labelText: 'Съхрани'}},
                        {...$meta, auth: {actorId: editorId}},
                    );

                    const result = await coreLabelSeed<{
                        inserted: number;
                        updated: number;
                        unchanged: number;
                        skipped: number;
                    }>({languageCode: RUN_LANGUAGE, label: 'Save=Запази'}, $meta);
                    assert.equal(result.updated, 0, 'the seed does not replace a hand edit');
                    assert.equal(result.skipped, 1, 'the hand-edited pair is counted as skipped');

                    const after = await coreLabelFind<Array<{labelText: string}>>(
                        {
                            filterBy: {languageCode: RUN_LANGUAGE, labelKey: 'Save'},
                            paging: {pageNumber: 1, pageSize: 10},
                        },
                        $meta,
                    );
                    assert.equal(after[0].labelText, 'Съхрани', 'the hand edit is still there');
                    return {labelId};
                },

                // 5. The resource half: merged by type alias and resource name,
                //    listed under the base64 id a dropdown option carries.
                async function resourceTranslations(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const {resourceId} = await coreResourceEnsure<{resourceId: string}>(
                        {name: 'TRANSLATION-TEST-SPORT', typeAlias: 'core.test.subject'},
                        $meta,
                    );
                    const merged = await coreTranslationSeed<{
                        inserted: number;
                        missing: number;
                    }>(
                        {
                            languageCode: RUN_LANGUAGE,
                            translation: [
                                `core.test.subject|TRANSLATION-TEST-SPORT=Тестов спорт`,
                                `core.test.subject|NO-SUCH-RESOURCE=Липсва`,
                            ].join('\n'),
                        },
                        $meta,
                    );
                    assert.equal(merged.inserted, 1, 'one known resource is translated');
                    assert.equal(merged.missing, 1, 'an unknown resource name is reported');

                    const dictionary = await coreTranslationList<Record<string, string>>(
                        {languageCode: RUN_LANGUAGE},
                        $meta,
                    );
                    const key = Buffer.from(resourceId.replace(/-/g, ''), 'hex').toString('base64');
                    assert.equal(dictionary[key], 'Тестов спорт', 'the base64 id is the key');

                    const rows = await coreTranslationFind<Array<{translationId: number}>>(
                        {
                            filterBy: {languageCode: RUN_LANGUAGE},
                            paging: {pageNumber: 1, pageSize: 10},
                        },
                        $meta,
                    );
                    assert.equal(rows.length, 1, 'the translation row exists');

                    // A second run changes nothing and, because the row still
                    // carries the seed actor, may refresh it.
                    const again = await coreTranslationSeed<{
                        inserted: number;
                        unchanged: number;
                        missing: number;
                    }>(
                        {
                            languageCode: RUN_LANGUAGE,
                            translation: 'core.test.subject|TRANSLATION-TEST-SPORT=Тестов спорт',
                        },
                        $meta,
                    );
                    assert.equal(again.inserted, 0, 'a re-run inserts nothing');
                    assert.equal(again.unchanged, 1, 'a re-run counts the pair unchanged');
                    return {translationId: rows[0].translationId};
                },

                // 6. The dropdown override answers the auto-bound map plus the
                //    translatable-resource list, which is what the editor page's
                //    resource picker reads. This process has no domain subject, so
                //    the list is empty here; what is proved is that the override is
                //    the one being called and that it keeps the generic answer.
                async function translationResourceList(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const lists = await coreDropdownList<Record<string, unknown>>({}, $meta);
                    assert.ok(
                        Array.isArray(lists['core.translationResource']),
                        'the translatable-resource list is present',
                    );
                    return lists;
                },

                // 7. Leave the database as it was found, so the next run of the
                //    suite starts from a clean slate instead of its own leftovers.
                async function cleanup(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const labels = await coreLabelDelete<number>(
                        {languageCode: RUN_LANGUAGE},
                        $meta,
                    );
                    const translations = await coreTranslationDelete<number>(
                        {languageCode: RUN_LANGUAGE},
                        $meta,
                    );
                    assert.equal(translations, 1, 'the translation row of this run is removed');
                    assert.ok(labels >= 2, 'the label rows of this run are removed');
                    return {labels, translations};
                },
            ]),
    }),
);

/* spell-checker: enable */
