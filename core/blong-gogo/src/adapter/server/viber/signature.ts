import {createHmac, timingSafeEqual} from 'node:crypto';

import {library} from '@feasibleone/blong/types';

/**
 * The Viber request signature.
 *
 * Viber signs the raw body with the bot's auth token and sends the hex digest in
 * `X-Viber-Content-Signature`. There is no timestamp header, so the raw bytes and a constant-time
 * compare are the whole check — and the bytes are exactly why the receiver keeps them.
 */
export interface IViberSignature {
    authToken?: string;
    signature?: string;
    rawBody?: Buffer;
}

export const viberSignatureMatches = ({
    authToken,
    signature,
    rawBody,
}: IViberSignature): boolean => {
    if (!authToken || !signature || !rawBody) return false;
    const expected = createHmac('sha256', authToken).update(rawBody).digest('hex');
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    return left.length === right.length && timingSafeEqual(left, right);
};

export default library(() => ({viberSignatureMatches}));
