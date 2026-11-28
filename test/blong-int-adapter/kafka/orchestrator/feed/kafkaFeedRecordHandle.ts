/**
 * `kafka.feed.record.handle` — the handler a feed's record is dispatched to.
 *
 * The name carries the port it is attached to, because no orchestrator owns this realm's handlers:
 * the feed decodes a record into a call and the call has to reach a port that answers it, and that
 * port is the admin adapter the feed runs beside (`@@D-1036`).
 *
 * A record says what it wants: `fail` makes the handler refuse it, `holdMs` makes it linger (which
 * is how a concurrency of more than one becomes observable), and `reply` makes it answer — the
 * answer is what the feed produces through the producer its topic resolves to (`@@D-1035`).
 * A record that asks for none of that answers nothing, which is the ordinary shape: the feed
 * commits on the completion of the dispatch, not on an answer.
 */
import {handler, type IMeta} from '@feasibleone/blong';

import {feedState} from '../../test/fixtures/feedState.ts';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export default handler(() => ({
    kafkaFeedRecordHandle: async (
        params: {
            offset?: number;
            fail?: boolean;
            failOnce?: boolean;
            run?: string;
            holdMs?: number;
            reply?: boolean;
        } = {},
        _meta?: IMeta,
    ) => {
        feedState.inFlight += 1;
        feedState.peakInFlight = Math.max(feedState.peakInFlight, feedState.inFlight);
        try {
            if (params.holdMs) await sleep(params.holdMs);
            // A record that fails exactly once, which is the retry path without a dead letter.
            const once = params.offset ?? -1;
            if (params.failOnce && !feedState.failedOnce.includes(once)) {
                feedState.failedOnce.push(once);
                feedState.failed += 1;
                feedState.lastError = `refused offset ${params.offset} on its first attempt`;
                throw new Error(feedState.lastError);
            }
            if (params.fail) {
                feedState.failed += 1;
                feedState.lastError = `refused offset ${params.offset} of run ${params.run}`;
                throw new Error(feedState.lastError);
            }
            feedState.processed += 1;
            if (params.offset !== undefined) feedState.offsets.push(params.offset);
            return params.reply ? {replied: true, run: params.run, offset: params.offset} : undefined;
        } finally {
            feedState.inFlight -= 1;
        }
    },
}));
