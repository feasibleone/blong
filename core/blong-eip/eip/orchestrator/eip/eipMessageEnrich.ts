import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Content Enricher: fetches additional data via mockDataEnrich,
 * merges it with the incoming params, then calls mockItemProcess with the enriched message.
 */
type Handler = (params: unknown) => Promise<unknown>;

export default handler(
    ({handler: {mockDataEnrich, mockItemProcess}}) =>
        async function eipMessageEnrich(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const enrichment = await mockDataEnrich(params, $meta);
            return mockItemProcess(Object.assign({}, params, enrichment), $meta);
        },
);
