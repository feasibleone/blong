/**
 * `kafka.feed.counter.get` — what the feed's handler has done so far.
 *
 * A test cannot subscribe to the feed's own progress, so the handler it dispatches to keeps the
 * count and this answers it (`@@D-1036`).
 */
import {handler} from '@feasibleone/blong';

import {feedState} from '../../test/fixtures/feedState.ts';

export default handler(() => ({
    kafkaFeedCounterGet: async () => ({...feedState, offsets: [...feedState.offsets]}),
}));
