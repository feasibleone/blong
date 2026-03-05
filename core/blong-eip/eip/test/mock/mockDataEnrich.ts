import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataEnrich(params: unknown, $meta: IMeta): Promise<{enrichment: string}> {
            return {enrichment: 'extra-data'};
        },
);
