import load from '@feasibleone/blong-gogo';
import browser from './browser.ts';
import pkg from './package.json' with {type: 'json'};

load(browser, pkg.name, {apiSchema: false}, ['microservice', 'integration', 'dev'])
    .then(platform => platform.start({}))
    .catch(console.error);
