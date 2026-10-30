import {handler} from '@feasibleone/blong/types';

/**
 * `response.receive` — the answer every Viber call in this group shares.
 *
 * Viber reports a refusal in the body: `status` is `0` for success and a positive number otherwise,
 * with `status_message` beside it. A status-code check alone would read every refusal as success, so
 * the body's own verdict is what decides.
 */
interface IViberAnswer {
    statusCode?: number;
    body?: {status?: number; status_message?: string; [key: string]: unknown};
}

export default handler(({lib: {error}}) => {
    const errors = error({
        'viber.refused': {
            message: 'Viber refused the call: {reason}',
            statusCode: 502,
        },
    });

    return function responseReceive(response: IViberAnswer) {
        const body = response?.body ?? {};
        if (body.status !== 0) {
            throw errors['viber.refused']({
                params: {reason: body.status_message ?? `status ${String(body.status)}`},
            });
        }
        return body;
    };
});
