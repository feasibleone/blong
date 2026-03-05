import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockPipeC(params: unknown, $meta: IMeta): Promise<unknown> {
            return Object.assign({}, params as object, {pipeC: true});
        },
);
