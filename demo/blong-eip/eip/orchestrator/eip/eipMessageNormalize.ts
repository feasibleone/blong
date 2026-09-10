import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Normalizer: converts the value to a standard representation based on
 * the format field, then calls mockItemProcess with the normalised message.
 * Supported formats: 'uppercase', 'lowercase', 'trim' (defaults to string coercion).
 */
type Handler = (params: {format: string; value: unknown}) => Promise<unknown>;

function normalize(format: string, value: unknown): string {
    const str = String(value);
    switch (format) {
        case 'uppercase':
            return str.toUpperCase();
        case 'lowercase':
            return str.toLowerCase();
        case 'trim':
            return str.trim();
        default:
            return str;
    }
}

export default handler(
    ({handler: {mockItemProcess}}) =>
        async function eipMessageNormalize(
            {format, value}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            return mockItemProcess({format, value: normalize(format, value)}, $meta);
        },
);
