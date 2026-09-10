import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Claim Check: stores the message via mockDataSave and obtains an ID,
 * then retrieves the stored message via mockDataGet using that ID.
 */
type Handler = (params: unknown) => Promise<unknown>;

export default handler(
    ({handler: {mockDataSave, mockDataGet}}) =>
        async function eipMessageClaim(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const {id} = await mockDataSave(params, $meta);
            return mockDataGet({id}, $meta);
        },
);
