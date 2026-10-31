import {createHmac, timingSafeEqual} from 'node:crypto';

import {library} from '@feasibleone/blong/types';

/**
 * The Slack request signature, as the port verifies it before any handler reads the payload.
 *
 * Slack signs `v0:{timestamp}:{rawBody}` with the app's signing secret and sends the hex digest in
 * `X-Slack-Signature`. Three things are part of the check rather than of the caller: the raw bytes
 * (any re-serialisation of the JSON changes them), a timestamp inside the skew window (which is what
 * an old request replayed later fails), and a constant-time compare (which is what keeps the secret
 * from leaking a byte at a time).
 */
export interface ISlackSignature {
    secret?: string;
    timestamp?: string;
    signature?: string;
    rawBody?: Buffer;
    /** The clock, injectable so a test can age a request without waiting. */
    now?: number;
    skewSeconds?: number;
}

export const slackSignatureMatches = ({
    secret,
    timestamp,
    signature,
    rawBody,
    now = Date.now(),
    skewSeconds = 300,
}: ISlackSignature): boolean => {
    if (!secret || !timestamp || !signature || !rawBody) return false;
    const sent = Number(timestamp);
    if (!Number.isFinite(sent)) return false;
    if (Math.abs(Math.floor(now / 1000) - sent) > skewSeconds) return false;
    const expected =
        'v0=' +
        createHmac('sha256', secret).update(`v0:${timestamp}:`).update(rawBody).digest('hex');
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    return left.length === right.length && timingSafeEqual(left, right);
};

export default library(() => ({slackSignatureMatches}));
