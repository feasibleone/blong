import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Prepares an echo request before sending over TCP.
 * Used as keepalive to maintain the connection to the HSM.
 */
export default handler(
    proxy =>
        function echoRequestSend(
            params: {data?: string; length?: number; message?: string},
            $meta: IMeta,
        ) {
            params = params || {};
            params.data = params.message || 'ping';
            params.length = params.data.length;
            return params;
        },
);
