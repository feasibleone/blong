import {handler} from '@feasibleone/blong/types';

/**
 * `slackIn.acknowledge` — the answer Slack gets, decided before the realm runs.
 *
 * The port acknowledges in `server` mode, so this hook is the only place a request can be answered
 * for its own kind: an event keeps the configured `EVENT_RECEIVED`, an interaction gets the JSON its
 * client reads, and a submission gets the `clear` that dismisses the view (`@@F-645`). The rules are
 * the port's and are asserted in `chatPorts.test.ts`; what is here is the wiring.
 */
export default handler(({lib: {slackAcknowledgeGet}}) => {
    return function slackInAcknowledge(request: {body?: unknown}) {
        return slackAcknowledgeGet(request.body);
    };
});
