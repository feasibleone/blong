import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineBlongStorybookMain({importMetaDirname: __dirname});
