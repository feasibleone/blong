import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {configGet, configThemeGet}}) => ({
    testConfigGet: ({name = 'configGet — root proxy access'}: {name?: string}, $meta: IMeta) =>
        group(name)([
            async function greetingComesFromConfig(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = (await configGet({}, $meta)) as {greeting: string};
                assert.equal(
                    result.greeting,
                    'hello',
                    'root proxy: config.greeting should equal the configured default',
                );
            },
        ]),

    testConfigThemeGet: (
        {name = 'configThemeGet — partial destructuring'}: {name?: string},
        $meta: IMeta,
    ) =>
        group(name)([
            async function themeNameComesFromConfig(
                assert: typeof Assert,
                {$meta}: {$meta: IMeta},
            ) {
                const result = (await configThemeGet({}, $meta)) as {themeName: string};
                assert.equal(
                    result.themeName,
                    'light',
                    'partial-destructuring: theme.name should equal the configured default',
                );
            },
        ]),
}));
