import {createHmac} from 'node:crypto';

import {TEST_PORTS} from './testPorts.ts';

/**
 * What a tap group needs to talk to the realm the way a platform does.
 *
 * The signature is the platform's own algorithm over the bytes that are sent, so a test that signs a
 * body exercises the receiver's parser and its verification together — a stubbed header would pass
 * whatever the code did.
 *
 * The addresses are the listeners' own ports, not the simulators': a platform posts to the port, and
 * which API the port posts back to is the account's setting (`@@D-687`). `CHAT_TEST_PORT` shifts all
 * four of them, which is what lets the suite run while a developer's `blong` process holds the real
 * ones — see `testPorts`.
 */
export const SLACK_SECRET = 'slack-signing-secret';
/** A second account on the same listener, whose messages no `forward` entry names. */
export const SLACK_OTHER_URL = `http://127.0.0.1:${TEST_PORTS.slack}/chat/slack/A2/T2`;
export const SLACK_URL = `http://127.0.0.1:${TEST_PORTS.slack}/chat/slack/A1/T1`;

export const slackHeaders = (
    raw: string,
    contentType = 'application/json',
): Record<string, string> => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature =
        'v0=' +
        createHmac('sha256', SLACK_SECRET).update(`v0:${timestamp}:`).update(raw).digest('hex');
    return {
        'content-type': contentType,
        'x-slack-signature': signature,
        'x-slack-request-timestamp': timestamp,
    };
};

export const slackPost = async (
    raw: string,
    contentType = 'application/json',
    headers = slackHeaders(raw, contentType),
    url = SLACK_URL,
): Promise<{status: number; text: string}> => {
    const response = await fetch(url, {method: 'POST', headers, body: raw});
    return {status: response.status, text: await response.text()};
};

export const VIBER_SECRET = 'viber-token';
export const VIBER_URL = `http://127.0.0.1:${TEST_PORTS.viber}/chat/viber/pa1/C1`;

export const viberHeaders = (raw: string): Record<string, string> => ({
    'content-type': 'application/json',
    'x-viber-content-signature': createHmac('sha256', VIBER_SECRET).update(raw).digest('hex'),
});

/** Viber signs the body itself, with no timestamp, so the same body is accepted whenever it arrives. */
export const viberPost = async (
    raw: string,
    headers = viberHeaders(raw),
): Promise<{status: number; text: string}> => {
    const response = await fetch(VIBER_URL, {method: 'POST', headers, body: raw});
    return {status: response.status, text: await response.text()};
};

/**
 * Wait for a state the realm reaches after the HTTP answer has already been sent.
 *
 * A platform is acknowledged before the realm processes the message (`mode: 'server'`), so the record
 * a step asserts on appears a tick later. Polling is the honest way to write that; a fixed sleep is
 * either too short on a loaded runner or wasted on an idle one.
 */
export const waitFor = async <T>(
    what: () => Promise<T | undefined> | T | undefined,
    timeoutMs = 3000,
): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await what();
        if (value) return value;
        if (Date.now() > deadline) throw new Error('timed out waiting for the expected state');
        await new Promise(resolve => setTimeout(resolve, 25));
    }
};
