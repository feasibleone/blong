import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

export default defineBlongConfig({
    projects: [{name: 'blong-commander', testDir: './test', testMatch: '**/*.play.ts'}],
});
