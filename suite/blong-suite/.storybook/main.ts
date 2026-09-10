// This file has been automatically migrated to valid ESM format by Storybook.
import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * blong-suite Storybook configuration.
 *
 * To add another realm's stories, append its package name to `realmPackages`.
 * The helper resolves each package's `src/stories/` directory automatically.
 */
export default defineBlongStorybookMain({
    importMetaDirname: __dirname,
    realmPackages: ['@feasibleone/blong-marine'],
});
