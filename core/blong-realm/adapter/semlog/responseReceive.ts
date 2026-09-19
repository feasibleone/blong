import {handler} from '@feasibleone/blong';

/**
 * The answer every read comes back through.
 *
 * `response.receive` is the framework's other conversion seam: the port loop runs it on
 * what the adapter's `exec` returned, with the method and the response's own meta, so one
 * handler here unwraps every one of the six reads. What it does is exactly what the reads
 * would otherwise each do by hand — hand the body on, and refuse to flatten a refusal into
 * an empty answer.
 *
 * The status travels with the failure because the service's refusals are answers of its
 * own: `404` says the execution was never retained, which a page has to be able to tell
 * apart from "nothing has been observed yet". The URL is read off the response rather than
 * from a parameter, because this handler serves six paths and knows none of them.
 */
export default handler(
    () =>
        function responseReceive(response: {
            statusCode: number;
            body: unknown;
            request?: {requestUrl?: string | URL};
        }) {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new Error(
                    `the semantic log service answered ${String(response.statusCode)} for ` +
                        `${String(response.request?.requestUrl ?? '')}`,
                );
            }
            return response.body;
        },
);
