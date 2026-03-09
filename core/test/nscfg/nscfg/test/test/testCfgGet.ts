import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {cfgGet}}) => ({
        testCfgGet: ({name = 'namespace config'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function configTsDefaultsMerged(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await cfgGet({}, $meta)) as {source: string; extra: string};
                    assert.equal(
                        result.extra,
                        'extra-from-folder',
                        'extra key from config.ts should be present',
                    );
                },
                async function namespaceOverrideApplied(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await cfgGet({}, $meta)) as {source: string; extra: string};
                    assert.equal(
                        result.source,
                        'namespace-override',
                        'source should be overridden via namespace config',
                    );
                },
            ]),
    }),
);
