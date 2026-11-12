/**
 * A `fetch` that waits as long as the answer takes.
 *
 * Node's `fetch` is undici, and undici gives up when a response's headers have not arrived
 * within five minutes (`headersTimeout`). That is a sensible default for a web request and
 * the wrong one for `chat.prompt.ask`, whose response is not late at all: it is being
 * written by a person in a chat window. The failure is a bare `fetch failed` after exactly
 * 300 seconds, while the gateway still holds the question — so the answer arrives, settles
 * a promise nobody is reading, and the caller has nothing (`@@F-716`).
 *
 * `node:http` has no such deadline: a client socket waits until it is closed. This module
 * is the smallest surface the MLE client needs — `{method, headers, body}` in, and a
 * response with `ok`, `status`, `json()` and `text()` out — so it is a drop-in for the
 * injected `fetchImpl`, not a replacement for `fetch` anywhere else.
 */

import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';

/** What a caller passes, in the shape the MLE client uses. */
export interface INodeFetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

/** What a caller reads back, in the shape the MLE client uses. */
export interface INodeFetchResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

/** One request, with no header or body deadline of its own. */
export function nodeFetch(
    url: string | URL,
    init: INodeFetchInit = {},
): Promise<INodeFetchResponse> {
    return new Promise((resolve, reject) => {
        const target = typeof url === 'string' ? new URL(url) : url;
        const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
        const request = send(
            target,
            {method: init.method ?? 'GET', headers: init.headers ?? {}},
            response => {
                const chunks: Buffer[] = [];
                response.on('data', chunk => chunks.push(chunk as Buffer));
                response.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    const status = response.statusCode ?? 0;
                    resolve({
                        ok: status >= 200 && status < 300,
                        status,
                        text: async () => text,
                        json: async () => JSON.parse(text) as unknown,
                    });
                });
                response.on('error', reject);
            },
        );
        request.on('error', reject);
        if (init.body !== undefined) request.write(init.body);
        request.end();
    });
}
