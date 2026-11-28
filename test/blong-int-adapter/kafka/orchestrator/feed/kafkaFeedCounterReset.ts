/**
 * `kafka.feed.counter.reset` — clear what the previous test left behind (`@@D-1036`).
 */
import {handler} from '@feasibleone/blong';

import {feedReset} from '../../test/fixtures/feedState.ts';

export default handler(() => ({
    kafkaFeedCounterReset: async () => {
        feedReset();
        return {reset: true};
    },
}));
