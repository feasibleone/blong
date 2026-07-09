import {handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function accessTestPrivate(): Promise<{success: boolean}> {
            return {success: true};
        },
);
