import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataEnrich(_params: unknown, _$meta: IMeta): Promise<{enrichment: string}> {
            return {enrichment: 'extra-data'};
        },
);
