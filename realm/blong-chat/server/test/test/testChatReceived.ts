import {handler} from '@feasibleone/blong';

import {recordForwarded, type IInboundRecord} from '../../../testRecord.ts';

/**
 * `test.chat.received` — the consumer the realm forwards to in a test run.
 *
 * The bridge has no opinion about a message beyond what `chat.in.receive` decides, so the only way to
 * see one arrive is to be the method its configuration names. That is the seam a real consumer uses,
 * and the test uses it the same way rather than reaching inside the realm.
 */
export default handler(() => ({
    async testChatReceived(message: IInboundRecord) {
        recordForwarded(message);
        return {handled: true};
    },
}));
