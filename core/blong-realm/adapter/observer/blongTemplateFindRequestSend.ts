import {handler} from '@feasibleone/blong';

/**
 * The request the port makes for `blong.template.find`: the messages the service has
 * learned.
 *
 * See `blongFlowFindRequestSend.ts` for why this is a conversion and not a handler.
 */
export default handler(
    () =>
        function blongTemplateFindRequestSend() {
            return {method: 'GET', path: '/templates', responseType: 'json'};
        },
);
