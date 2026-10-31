import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `task.pool.reset` — put the fixture back to its first ticket.
 *
 * A pool that only ever hands tickets out makes every test depend on the order the tests ran in, which
 * is how a suite starts passing for the wrong reason. Reset is the fixture's own word for "as if this
 * were a new process", and a `blong-task`-backed pool will answer it with a truncate it owns.
 */
export default handler(({lib: {taskPoolReset}}) => ({
    async taskPoolReset(_params: unknown, _$meta: IMeta): Promise<{reset: boolean}> {
        taskPoolReset();
        return {reset: true};
    },
}));
