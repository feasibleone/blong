import {handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function accessTestPublic(): Promise<{success: boolean}> {
            return {success: true};
        },
);
