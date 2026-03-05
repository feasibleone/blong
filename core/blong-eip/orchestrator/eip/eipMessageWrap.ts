import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Envelope Wrapper: encodes params as a base64 payload and forwards
 * the envelope to mockItemProcess.
 */
type Handler = (params: unknown) => Promise<unknown>;

export default handler(
    ({handler: {mockItemProcess}}) =>
        async function eipMessageWrap(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const payload = Buffer.from(JSON.stringify(params)).toString('base64');
            return mockItemProcess({payload}, $meta);
        },
);
