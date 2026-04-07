import { handler } from '@feasibleone/blong';

export default handler(
    ({lib: {storeSet, PERMISSIONS_KEY}}) =>
        function storagePermissionsSet({permissions}: {permissions: string[]}): string[] {
            if (permissions) storeSet(PERMISSIONS_KEY, JSON.stringify(permissions));
            return permissions ?? [];
        },
);
