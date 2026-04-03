import { type IMeta, handler } from '@feasibleone/blong';

export default handler(
    ({handler: {storageTokenGet, storagePermissionsGet}}) =>
        async function authSessionGet(
            _params: object,
            $meta: IMeta,
        ): Promise<{token: string | null; permissions: string[]}> {
            const token = (await storageTokenGet({}, $meta)) as string | null;
            const permissions = (await storagePermissionsGet({}, $meta)) as string[];
            return {token, permissions};
        },
);
