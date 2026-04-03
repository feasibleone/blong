import { handler } from '@feasibleone/blong';

export default handler(
    ({lib: {storeDelete, TOKEN_KEY}}) =>
        function storageTokenDelete(): null {
            storeDelete(TOKEN_KEY);
            return null;
        },
);
