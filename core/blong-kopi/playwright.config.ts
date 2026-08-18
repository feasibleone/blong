import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

export default defineBlongConfig({
    // Adjust these ports if they clash with another locally-running realm.
    backendPort: 9003,
    frontendPort: 9103,
});
