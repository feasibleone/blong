import load from '@feasibleone/blong-gogo';

import browser from './index.browser.ts';
import pkg from './package.json' with {type: 'json'};

/**
 * index.html.ts — what Vite serves (`@@T-796`).
 *
 * The same three intents the viewer's page runs under: the browser platform loads, but nothing is
 * served from `microservice`, so a developer's Vite dev server and a CI Playwright run stand the
 * page up the same way.
 */
load(browser, pkg.name, {apiSchema: false}, ['microservice', 'integration', 'dev'])
    .then(platform => platform.start({}))
    .catch(console.error);
