import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

export default defineBlongConfig({
    projects: [{name: 'blong-marine', testDir: './test', testMatch: '**/*.play.ts'}],
});
