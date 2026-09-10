import {realm} from '@feasibleone/blong';

/**
 * Slack adapter realm stub.
 * Excluded from automated CI — requires a Slack API token (SLACK_TOKEN env var).
 * Activate manually with: BLONG_ENV=adapter.slack
 */
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [],
    config: {
        default: {},
    },
}));
