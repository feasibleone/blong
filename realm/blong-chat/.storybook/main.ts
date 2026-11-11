import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Chat Storybook: the stories in `src/stories/` render against the mock adapter. */
export default defineBlongStorybookMain({importMetaDirname: __dirname});
