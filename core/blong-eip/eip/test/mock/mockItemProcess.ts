import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockItemProcess(item: unknown, $meta: IMeta): Promise<unknown> {
            return {processed: true, item};
        },
);
