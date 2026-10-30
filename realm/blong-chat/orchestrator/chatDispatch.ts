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
 * declaration here, and a group that is not one of the three is not.
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
            imports: [/\.(in|out|prompt)$/],
            forward: {'*': 'chat.in.message.ignore'},
        },
    },
}));
