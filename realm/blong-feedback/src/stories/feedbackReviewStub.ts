import type {IFeedbackItem, IFeedbackSession} from '@feasibleone/blong';

import {renderProse} from '../../adapter/db/prose.ts';
import {FIXTURE_ITEMS, FIXTURE_SESSIONS, FIXTURE_SHOT_SIZE} from './feedbackReviewFixture.ts';

/**
 * The fake realm the review story runs on (`@@T-499`).
 *
 * Not a set of answers: `feedback.item.edit` writes to an in-memory list and
 * `feedback.prose.render` runs the realm's own `renderProse` over it, so a
 * reviewer's edit shows up in the document exactly as it does against a database.
 * A stub that returned a fixed document made the story lie about the one thing the
 * workflow is for, which is why the fake lives here — where a test can reach it —
 * rather than in the story file.
 *
 * One store per call, so a reader who edits a comment in one story does not find it
 * edited in the next.
 */

/** A fixture item as the wire carries it: the shared shape plus the row id. */
type StubItem = IFeedbackItem & {feedbackItemId: string};

/** What an edit of one item may carry, as the page sends it. */
export interface IStubEdit {
    itemId?: string;
    refinedText?: string;
    callout?: {x: number; y: number; width: number; height: number};
    removed?: boolean;
}

/** The one session the stories open, as the database would answer it. */
const FIXTURE_SESSION = FIXTURE_SESSIONS[0] as unknown as IFeedbackSession;

/**
 * The answers the page expects, over a list an edit can change.
 *
 * The picture is passed in rather than imported: it is a URL a bundler mints, and a
 * module the test reads cannot carry one (`@@T-499`).
 */
export function makeStubDispatch(shotData: string) {
    let items = FIXTURE_ITEMS.map(item => ({...item})) as unknown as StubItem[];
    return (method: string, params?: Record<string, unknown>) => {
        switch (method) {
            case 'feedback.session.list':
                return Promise.resolve({
                    sessions:
                        params?.status === 'processed'
                            ? FIXTURE_SESSIONS.map(session => ({...session, status: 'processed'}))
                            : FIXTURE_SESSIONS,
                });
            case 'feedback.session.items':
                return Promise.resolve({
                    session: {...FIXTURE_SESSION, ...FIXTURE_SHOT_SIZE},
                    items,
                });
            case 'feedback.shot.get':
                return Promise.resolve({shotData, mimeType: 'image/jpeg'});
            case 'feedback.prose.render':
                return Promise.resolve({
                    document: renderProse([{session: FIXTURE_SESSION, items}]),
                    sessionIds: [FIXTURE_SESSION.sessionId],
                    itemCount: items.filter(item => !item.removedAt).length,
                });
            case 'feedback.session.update':
                return Promise.resolve({updated: 1});
            case 'feedback.item.edit': {
                const edit = (params ?? {}) as IStubEdit;
                items = items.map(item =>
                    item.feedbackItemId === edit.itemId
                        ? {
                              ...item,
                              ...(edit.refinedText !== undefined && {
                                  refinedText: edit.refinedText,
                              }),
                              ...(edit.callout !== undefined && {callout: edit.callout}),
                              ...(edit.removed !== undefined && {
                                  removedAt: edit.removed
                                      ? new Date().toISOString()
                                      : undefined,
                              }),
                          }
                        : item,
                );
                return Promise.resolve({updated: 1});
            }
            default:
                return Promise.reject(new Error(`the story stub has no answer for ${method}`));
        }
    };
}
