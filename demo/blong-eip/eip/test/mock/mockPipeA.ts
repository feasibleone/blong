import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockPipeA(params: unknown, _$meta: IMeta): Promise<unknown> {
            return Object.assign({}, params as object, {pipeA: true});
        },
);
