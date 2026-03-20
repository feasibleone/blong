import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Handles incoming requests on the simulated Payshield TCP server.
 *
 * When a request arrives, this handler sets up a dispatch function that
 * generates mock responses for each supported Payshield command:
 * - echo: Returns input data with errorCode '00' (connection keepalive)
 * - generateKey: Returns a mock key and errorCode '00'
 *
 * The $meta.dispatch function is called by the TCP adapter loop after
 * the receive phase to send the response back to the client.
 */
export default handler(
    proxy =>
        function receive(params: unknown, $meta: IMeta): unknown {
            if ($meta.mtid === 'request') {
                $meta.dispatch = (params: {data: unknown}, dispatchMeta: IMeta) => {
                    dispatchMeta.mtid = 'response';
                    switch (dispatchMeta.method) {
                        case 'echo':
                            return [{data: params.data, errorCode: '00'}, dispatchMeta];
                        case 'generateKey':
                            return [
                                {
                                    key: '0'.repeat(33),
                                    errorCode: '00',
                                    rest: Buffer.from('000'),
                                },
                                dispatchMeta,
                            ];
                    }
                };
            }
            return params;
        },
);
