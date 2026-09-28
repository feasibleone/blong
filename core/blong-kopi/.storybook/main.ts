import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * $subject Storybook configuration.
 *
 * Stories are discovered in `src/stories/`. To render another realm's stories
 * beside this one, pass `realmPackages: ['@feasibleone/<realm>']` — the helper
 * resolves each package's story paths for you.
 */
export default defineBlongStorybookMain({importMetaDirname: __dirname});
