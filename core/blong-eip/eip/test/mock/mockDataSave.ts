import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataSave(data: unknown, $meta: IMeta): Promise<{id: string}> {
            return {id: 'claim-id'};
        },
);
