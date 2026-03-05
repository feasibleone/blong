import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataGet(
            params: {id: string},
            $meta: IMeta,
        ): Promise<{id: string; payload: unknown}> {
            return {id: params.id, payload: 'stored-data'};
        },
);
