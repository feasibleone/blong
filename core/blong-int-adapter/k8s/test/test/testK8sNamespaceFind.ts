import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {clusterNamespaceFind}}) => ({
    testK8sNamespaceFind: ({name = 'k8s namespace list'}: {name?: string}) =>
        group(name)([
            async function listNamespaces(assert: typeof Assert, {$meta}) {
                const result = await clusterNamespaceFind({}, $meta);
                assert.ok(
                    Array.isArray(result) || typeof result === 'object',
                    'Should return namespaces',
                );
                const items = (result as {items?: unknown[]}).items ?? (result as unknown[]);
                assert.ok(
                    Array.isArray(items) && items.length > 0,
                    'Should have at least one namespace',
                );
                return result;
            },
        ]),
}));
