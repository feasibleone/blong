import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {authRealmFind}}) => ({
    testKeycloakRealmFind: ({name = 'keycloak realm list'}, $meta) =>
        group(name)([
            async function listRealms(assert: typeof Assert, {$meta}) {
                const result = await authRealmFind({}, $meta);
                assert.ok(Array.isArray(result), 'Realm list should return an array');
                assert.ok(
                    (result as unknown[]).length > 0,
                    'Realm list should contain at least the master realm',
                );
                const master = (result as {realm?: string}[]).find(r => r.realm === 'master');
                assert.ok(master, 'master realm should be present');
                return result;
            },
        ]),
}));
