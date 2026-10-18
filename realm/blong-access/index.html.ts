import load from '@feasibleone/blong-gogo';
import browser from './index.browser.ts';
import pkg from './package.json' with {type: 'json'};

load(browser, pkg.name, {apiSchema: false}, ['microservice', 'integration', 'dev', 'test-ui'])
    .then(platform => platform.start({}))
    .catch(console.error);
