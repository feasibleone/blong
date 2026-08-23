import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testCommander — integration test for the generic commander protocol:
 *   commander.source.list   → configured (permission-filtered) sources
 *   commander.branch.list   → children of a source / node (dispatched triples)
 */
export default handler(
    ({lib: {group}, handler: {commanderSourceList, commanderBranchList}}) => ({
        testCommander: ({name = 'commander protocol'}: {name?: string}) =>
            group(name)([
                async function listSources(assert: typeof Assert, {$meta}) {
                    const result = await commanderSourceList({}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'source.list should return items');
                    assert.ok(items.length > 0, 'should list at least one source');
                    return result;
                },
                async function listSourcesFiltered(assert: typeof Assert, {$meta}) {
                    // A caller granted only some actions is pruned to the
                    // sources it may see: `keycloak-dev` (declares a source-level
                    // permission) is hidden, permission-less sources remain.
                    const restricted = await commanderSourceList(
                        {},
                        {...$meta, auth: {actions: ['access.table.list']}},
                    );
                    const restrictedItems = ((restricted as {items?: unknown[]}).items ??
                        []) as Array<{name?: string; levels?: unknown[]}>;
                    // Source-level permissions gate whole sources; level-level
                    // permissions gate drill-down. `keycloak-dev` declares only
                    // level permissions, so an unrelated-action caller still sees
                    // the source but its levels are pruned.
                    const keycloak = restrictedItems.find(s => s.name === 'keycloak-dev');
                    assert.ok(keycloak, 'unrelated-action caller should still see keycloak source');
                    assert.ok(
                        !(keycloak?.levels?.length),
                        'unrelated-action caller should see no keycloak levels',
                    );
                    assert.ok(
                        restrictedItems.some(source => source.name === 'access-db'),
                        'unrelated-action caller should still see the permission-less access-db',
                    );
                    // A caller granted the keycloak realm action sees it.
                    const granted = await commanderSourceList(
                        {},
                        {
                            ...$meta,
                            auth: {actions: ['keycloakDev.realm.list']},
                        },
                    );
                    const grantedItems = ((granted as {items?: unknown[]}).items ??
                        []) as Array<{name?: string; levels?: unknown[]}>;
                    const grantedKeycloak = grantedItems.find(s => s.name === 'keycloak-dev');
                    assert.ok(grantedKeycloak, 'granted caller should see the keycloak-dev source');
                    assert.ok(
                        (grantedKeycloak?.levels?.length ?? 0) > 0,
                        'granted caller should see keycloak levels',
                    );
                    return granted;
                },
                async function listTables(assert: typeof Assert, {$meta}) {
                    const result = await commanderBranchList({source: 'access-db', level: -1}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'branch.list should return tables');
                    assert.ok(items.length > 0, 'should list at least one table');
                    return result;
                },
            ]),
    }),
);
