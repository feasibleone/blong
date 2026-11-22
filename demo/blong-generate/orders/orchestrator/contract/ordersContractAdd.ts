/* eslint-disable @typescript-eslint/no-unused-vars -- a generated stub has not used its arguments yet */
// Generated from the API definition of this realm. While the marker import below is here this file is
// a stub and the next run rewrites it; saving the file in an editor drops that unused import, and the
// file becomes yours.
import unchanged from '@feasibleone/blong';
import {type IMeta, handler} from '@feasibleone/blong/types';

// #region API
type Handler = (params: {
    customerName: string; // Who the contract is with.
    currencyCode: string; // ISO 4217 code the amounts are written in.
    note?: string; // Free text the sales desk may leave on the draft.
}) => Promise<{
    contractId: string;
    status: string;
}>;
// #endregion

export default handler(
    () =>
        async function ordersContractAdd(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            // A stub, not a handler: the signature is the contract, the body is yours. Throwing says
            // so at the first call rather than answering a reply that was never computed.
            throw new Error('generated stub: ordersContractAdd has no body yet');
        },
);
