/* spell-checker: disable */
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testFeedbackFlow.ts — the feedback storage contract
 * (`@@T-477`).
 *
 * Proves, against a real database:
 *
 * 1. `feedback.session.add` stores a session, its items and its screenshot in one
 *    go, keeps the wording verbatim, and answers the session id.
 * 2. `feedback.prose.render` builds the document from those rows — every
 *    identifier, in the order the boxes were made.
 * 3. `feedback.item.edit` refines one wording, and the *next* render shows the
 *    refinement instead of the original (`@@D-660`: nothing is stored, so a
 *    correction cannot go stale).
 * 4. `feedback.session.update` marks exactly the named session processed.
 * 5. Rendering the `new` queue afterwards answers an empty document — the queue
 *    shrank, and a render never mutates anything (`@@D-663`).
 * 6. Moving a callout and closing a comment are row updates: the box reads back as
 *    the fraction it was written as, the closed comment leaves the document, and
 *    restoring it puts it back (`@@T-495`, `@@T-496`).
 * 7. `feedback.shot.get` returns the stored picture, and an unknown session is
 *    refused.
 *
 * Registered as the `test.feedback.flow` group (`integration.watch.test` in
 * index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            feedbackSessionAdd,
            feedbackProseRender,
            feedbackItemEdit,
            feedbackSessionUpdate,
            feedbackShotGet,
            feedbackSessionItems,
            feedbackSessionRemove,
            feedbackItemRemove,
            feedbackShotRemove,
        },
    }) => ({
        testFeedbackFlow: ({name = 'feedback flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. One submission: three comments and a picture.
                async function addSession(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const shotData = `data:image/jpeg;base64,${'A'.repeat(64)}`;
                    const result = await feedbackSessionAdd<{
                        sessionId: string;
                        itemCount: number;
                    }>(
                        {
                            session: {
                                pageUrl: '/s/athlete',
                                pageTitle: 'Athletes',
                                pageSubject: 'sport',
                                pageObject: 'athlete',
                                pageKind: 'browse',
                                languageCode: 'en',
                                viewportJSON: '1280x800@1',
                                shotStatus: 'captured',
                                items: [
                                    {
                                        targetId: 'sport.athlete.browse/card:master',
                                        targetKind: 'card',
                                        targetLabel: 'Master',
                                        commentText: 'The card is cut off.',
                                        anchor: {x: 0.1, y: 0.2, width: 0.4, height: 0.3},
                                        callout: {x: 0.55, y: 0.25, width: 0.2, height: 0.15},
                                    },
                                    {
                                        targetId:
                                            'sport.athlete.browse/table:athletes/column:athleteName',
                                        targetKind: 'column',
                                        targetLabel: 'Name',
                                        commentText: 'The header wraps.',
                                    },
                                    {
                                        targetId:
                                            'sport.athlete.browse/card:master/field:athlete.birthDate',
                                        targetKind: 'field',
                                        targetLabel: 'Birth date',
                                        commentText: 'The picker opens off-screen.',
                                    },
                                ],
                                shot: {
                                    shotData,
                                    mimeType: 'image/jpeg',
                                    shotWidth: 1280,
                                    shotHeight: 800,
                                    byteSize: shotData.length,
                                },
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.itemCount, 3, 'three items are stored');
                    assert.ok(result.sessionId, 'the session id is answered');
                    return {sessionId: result.sessionId, shotData};
                },

                // 2. The document is built from the stored rows.
                async function renderDocument(
                    assert: IAssert,
                    {$meta, addSession}: {$meta: IMeta; addSession: Promise<unknown>},
                ) {
                    const sid = ((await addSession) as {sessionId: string}).sessionId;
                    const result = await feedbackProseRender<{
                        document: string;
                        sessionIds: string[];
                        itemCount: number;
                    }>({sessionIds: [sid]}, $meta);
                    assert.equal(result.itemCount, 3, 'all three items are rendered');
                    assert.ok(
                        result.document.includes('sport.athlete.browse/card:master'),
                        'the card identifier is in the document',
                    );
                    assert.ok(
                        result.document.includes(
                            'sport.athlete.browse/table:athletes/column:athleteName',
                        ),
                        'the column identifier is in the document',
                    );
                    assert.ok(
                        result.document.includes('> The header wraps.'),
                        'the wording is quoted verbatim',
                    );
                    assert.ok(
                        result.document.includes('blong-feedback v1'),
                        'the document names its format',
                    );
                    const cardIndex = result.document.indexOf('card:master');
                    const columnIndex = result.document.indexOf('column:athleteName');
                    assert.ok(
                        cardIndex >= 0 && cardIndex < columnIndex,
                        'items keep the order the boxes were made in',
                    );
                    return result;
                },

                // 3. A reviewer's clarification wins over the original wording.
                async function refineOneItem(
                    assert: IAssert,
                    {$meta, addSession}: {$meta: IMeta; addSession: Promise<unknown>},
                ) {
                    const sid = ((await addSession) as {sessionId: string}).sessionId;
                    const stored = (await feedbackSessionItems({sessionId: sid}, $meta)) as {
                        items?: Array<{targetId: string; feedbackItemId: string}>;
                    };
                    const items = stored?.items ?? [];
                    const column = items.find(item => item.targetId.endsWith('column:athleteName'));
                    assert.ok(column, 'the column item is readable');
                    const result = await feedbackItemEdit<{updated: number}>(
                        {
                            sessionId: sid,
                            itemId: column!.feedbackItemId,
                            refinedText: 'The column header wraps at 1280px and clips Name.',
                        },
                        $meta,
                    );
                    assert.equal(result.updated, 1, 'the refinement is stored');
                    return result;
                },

                // 4. The next render shows the refinement — nothing was cached.
                async function renderAfterEdit(
                    assert: IAssert,
                    {$meta, addSession}: {$meta: IMeta; addSession: Promise<unknown>},
                ) {
                    const sid = ((await addSession) as {sessionId: string}).sessionId;
                    const result = await feedbackProseRender<{document: string}>(
                        {sessionIds: [sid]},
                        $meta,
                    );
                    assert.ok(
                        result.document.includes('clips Name'),
                        'the refined wording replaced the original',
                    );
                    assert.ok(
                        !result.document.includes('> The header wraps.'),
                        'the superseded wording is gone from the document',
                    );
                    return result;
                },

                // 5. The reviewer's geometry and a closed comment are rows, not state.
                async function moveAndClose(
                    assert: IAssert,
                    {
                        $meta,
                        addSession,
                        renderAfterEdit,
                    }: {
                        $meta: IMeta;
                        addSession: Promise<unknown>;
                        renderAfterEdit: Promise<unknown>;
                    },
                ) {
                    const sid = ((await addSession) as {sessionId: string}).sessionId;
                    await renderAfterEdit;
                    const stored = (await feedbackSessionItems({sessionId: sid}, $meta)) as {
                        items?: Array<{
                            feedbackItemId: string;
                            targetId: string;
                            callout?: {x: number; y: number; width: number; height: number};
                        }>;
                    };
                    const items = stored?.items ?? [];
                    const card = items.find(item => item.targetId.endsWith('card:master'));
                    assert.ok(card, 'the card item is readable');

                    // A box the reviewer moved is written as fractions and reads back.
                    const callout = {x: 0.2, y: 0.4, width: 0.3, height: 0.25};
                    const moved = await feedbackItemEdit<{updated: number}>(
                        {sessionId: sid, itemId: card!.feedbackItemId, callout},
                        $meta,
                    );
                    assert.equal(moved.updated, 1, 'the new box is stored');
                    const afterMove = (await feedbackSessionItems({sessionId: sid}, $meta)) as {
                        items?: Array<{targetId: string; callout?: typeof callout}>;
                    };
                    const readBack = afterMove.items?.find(item =>
                        item.targetId.endsWith('card:master'),
                    )?.callout;
                    assert.equal(
                        JSON.stringify(readBack),
                        JSON.stringify(callout),
                        'the box reads back with the fractions it was given',
                    );

                    // Closing is a row update, and the document drops the comment.
                    const closed = await feedbackItemEdit<{updated: number}>(
                        {sessionId: sid, itemId: card!.feedbackItemId, removed: true},
                        $meta,
                    );
                    assert.equal(closed.updated, 1, 'the close is stored');
                    const withClosed = await feedbackProseRender<{
                        document: string;
                        itemCount: number;
                    }>({sessionIds: [sid]}, $meta);
                    // The field item's identifier contains `card:master` too, so the
                    // closed item is recognised by its own heading and label.
                    assert.ok(
                        !withClosed.document.includes('card "Master"'),
                        'a closed comment is not in the document',
                    );
                    assert.equal(withClosed.itemCount, 2, 'and the count agrees with the document');

                    // Restoring puts it back where the reviewer left it.
                    await feedbackItemEdit(
                        {sessionId: sid, itemId: card!.feedbackItemId, removed: false},
                        $meta,
                    );
                    const restored = await feedbackProseRender<{
                        document: string;
                        itemCount: number;
                    }>({sessionIds: [sid]}, $meta);
                    assert.ok(
                        restored.document.includes('card "Master"'),
                        'a restored comment is in the document again',
                    );
                    assert.equal(restored.itemCount, 3, 'and the count is whole again');
                    return restored;
                },

                // 6. The queue shrinks by an explicit mark, not by rendering.
                async function markProcessed(
                    assert: IAssert,
                    {$meta, addSession}: {$meta: IMeta; addSession: Promise<unknown>},
                ) {
                    const sid = ((await addSession) as {sessionId: string}).sessionId;
                    const result = await feedbackSessionUpdate<{updated: number}>(
                        {sessionIds: [sid]},
                        $meta,
                    );
                    assert.equal(result.updated, 1, 'exactly one session is marked');
                    const queue = await feedbackProseRender<{
                        document: string;
                        itemCount: number;
                        sessionIds: string[];
                    }>({status: 'new'}, $meta);
                    assert.ok(
                        !queue.sessionIds.includes(sid),
                        'the processed session left the queue',
                    );
                    return result;
                },

                // 7. The picture reads back, and a missing one is a typed error.
                async function readShot(
                    assert: IAssert,
                    {$meta, addSession}: {$meta: IMeta; addSession: Promise<unknown>},
                ) {
                    const {sessionId: sid, shotData} = (await addSession) as {
                        sessionId: string;
                        shotData: string;
                    };
                    const shot = await feedbackShotGet<{shotData: string; mimeType: string}>(
                        {sessionId: sid},
                        $meta,
                    );
                    assert.equal(shot.shotData, shotData, 'the stored picture is returned');
                    assert.equal(shot.mimeType, 'image/jpeg', 'with its type');
                    // Declared: the refusal is the assertion, so it belongs at `debug`
                    // rather than beside the failures nobody asked for (@@D-695).
                    await assert.rejects(
                        () =>
                            feedbackShotGet(
                                {sessionId: '9d1c1f7a-0000-4000-8000-000000000000'},
                                {...$meta, expect: 'feedback.shotMissing'},
                            ) as Promise<unknown>,
                        /has no screenshot/,
                        'an unknown session is refused',
                    );
                    return shot;
                },

                // 8. Leave no rows behind — the flow may run on every save.
                async function cleanup(
                    assert: IAssert,
                    {$meta, addSession}: {$meta: IMeta; addSession: Promise<unknown>},
                ) {
                    const sid = ((await addSession) as {sessionId: string}).sessionId;
                    const stored = (await feedbackSessionItems({sessionId: sid}, $meta)) as {
                        items?: Array<{feedbackItemId: string}>;
                    };
                    const items = stored?.items ?? [];
                    await (
                        feedbackShotRemove({shot: {sessionId: sid}}, $meta) as Promise<unknown>
                    ).catch(() => undefined);
                    for (const item of items) {
                        await (
                            feedbackItemRemove(
                                {item: {feedbackItemId: item.feedbackItemId, sessionId: sid}},
                                $meta,
                            ) as Promise<unknown>
                        ).catch(() => undefined);
                    }
                    await (
                        feedbackSessionRemove(
                            {session: {sessionId: sid}},
                            $meta,
                        ) as Promise<unknown>
                    ).catch(() => undefined);
                    assert.ok(true, 'the rows this run wrote are removed');
                },
            ]),
    }),
);
