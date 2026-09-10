import {realm} from '@feasibleone/blong';

/**
 * GitHub adapter realm stub.
 * Excluded from automated CI — requires a GitHub API token (GITHUB_TOKEN env var).
 * Activate manually with: BLONG_ENV=adapter.github
 */
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [],
    config: {
        default: {},
    },
}));
