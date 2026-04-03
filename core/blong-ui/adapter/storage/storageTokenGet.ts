import { handler } from '@feasibleone/blong';

export default handler(
    ({lib: {storeGet, TOKEN_KEY}}) =>
        function storageTokenGet(): string | null {
            return storeGet(TOKEN_KEY);
        },
);
