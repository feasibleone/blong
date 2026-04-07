import { handler } from '@feasibleone/blong';

export default handler(
    ({lib: {storeGet, PERMISSIONS_KEY}}) =>
        function storagePermissionsGet(): string[] {
            const raw = storeGet(PERMISSIONS_KEY);
            return raw ? (JSON.parse(raw) as string[]) : [];
        },
);
