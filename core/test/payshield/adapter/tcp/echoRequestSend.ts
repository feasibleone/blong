import { handler } from '@feasibleone/blong';

export default handler(proxy => function echoRequestSend(params: {data?: string, length?: number, message?: string}, $meta) {
    params = params || {};
    params.data = params.message || 'ping';
    params.length = params.data.length;
    return params;
});
