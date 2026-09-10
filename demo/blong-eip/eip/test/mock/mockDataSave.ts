import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataSave(_data: unknown, _$meta: IMeta): Promise<{id: string}> {
            return {id: 'claim-id'};
        },
);
