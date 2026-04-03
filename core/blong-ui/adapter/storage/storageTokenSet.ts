import { handler } from '@feasibleone/blong';

export default handler(
    ({lib: {storeSet, TOKEN_KEY}}) =>
        function storageTokenSet({token}: {token: string}): string | null {
            if (token) storeSet(TOKEN_KEY, token);
            return token ?? null;
        },
);
