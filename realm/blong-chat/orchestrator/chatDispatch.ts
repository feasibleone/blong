import {orchestrator} from '@feasibleone/blong';

/**
 * orchestrator/chatDispatch.ts — the realm's one served namespace.
 *
 * The two orchestrators the request names are namespaces rather than services: `chat.in` carries the
 * inbound message and answer handlers, `chat.out` the outbound send, and `chat.prompt` the ask that
 * waits for one. They share one dispatch port because a namespace is the unit another process dials,
 * and all three answer `chat.*` — splitting them would publish three Services for one conversation
 * (`@@D-679`).
 *
 * The imports are by suffix, so a handler group added beside these is picked up without a second
 * declaration here, and a group that is not one of the six is not. `credential` is here because the
 * platform ports read their accounts from this realm rather than from their own configuration, and a
 * dispatch into an adapter folder can resolve without running the handler (`@@F-663` `@@D-797`).
 * `account` holds only the two methods that change what the shared adapter answered — the list, which
 * masks the credentials it holds, and the save, which drops a mask sent back — and every other model
 * method falls through to `db` (`@@T-625`).
 *
 * `forward` is the one setting the handlers read from this port rather than from their own folder's
 * slice, and its default is the realm's own drop handler: a deployment that names no consumer still
 * answers the platform, and one that names a consumer per account replaces that account's entry
 * instead of switching the behaviour on (`@@F-641`).
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'chat',
            imports: [/chat\.(in|out|prompt|channel|credential|account)$/],
            /**
             * Where a method this port holds no handler for goes: the shared `db` adapter, which
             * serves the model pages' CRUD from the table schema.
             *
             * Without it the port answered `chat.account.find` with nothing — the route exists, the
             * method resolves to this namespace, and the port held neither a handler nor a fallback,
             * so the gateway serialized `undefined`. The realm's own handlers keep answering their own
             * names; only the ones it does not hold are forwarded (`@@T-626`).
             */
            destination: 'db',
            forward: {'*': 'chat.in.message.ignore'},
            /**
             * No conversation memory unless a deployment asks for it: `db` needs the shared database
             * adapter in the process, and `none` is what keeps a listener-only deployment and this
             * realm's own test suite working without one (`@@D-727`).
             */
            channelStore: 'none',
        },
    },
}));
