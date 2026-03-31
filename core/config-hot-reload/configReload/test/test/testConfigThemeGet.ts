import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Standalone test for the partial-destructuring pattern.
 * `testConfigThemeGet` is kept separate so watch-mode can rerun just
 * `test.config.theme.get` in isolation.
 */
export default handler(({lib: {group}, handler: {configThemeGet}}) => ({
    testConfigThemeGet: (
        {name = 'configThemeGet — partial destructuring (standalone)'}: {name?: string},
        $meta: IMeta,
    ) =>
        group(name)([
            async function themeNameReflectsConfig(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = (await configThemeGet({}, $meta)) as {themeName: string};
                assert.equal(
                    result.themeName,
                    'light',
                    'partial-destructuring: theme.name should equal the configured default',
                );
            },
        ]),
}));
