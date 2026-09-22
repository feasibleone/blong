import {orchestrator, type IMeta} from '@feasibleone/blong/types';
import {recordedCall} from '../../lib.ts';
import {declareCall, namespaceOf} from '../../semanticContext.ts';

export default orchestrator<{destination?: string; appendNamespace?: string}>(({remote}) => ({
    activation: {
        default: {
            type: 'dispatch',
        },
    },
    start() {
        super.connect();
        return super.start();
    },
    async exec(...params: unknown[]) {
        // Support both `destination` (slash-based routing, auto-stripped by methodPath)
        // and `appendNamespace` (dot-based prefix, stripped via stripNamespace on receiver).
        const destination = this.config.destination;
        const appendNamespace = this.config.appendNamespace;
        const prefix = destination ?? appendNamespace;
        const separator = destination ? '/' : '.';
        if (prefix && params.length > 1) {
            const $meta = params.pop() as IMeta;
            if ($meta?.method) {
                const forwarded = prefix + separator + $meta.method;
                // The hop this orchestrator makes is a call of the flow like any other, so
                // it is declared and recorded exactly as a proxied call is. Both halves are
                // needed: the declaration names the call, and the record is the evidence the
                // ledger reads. A leg nobody wrote a record inside is one it only ever hears
                // about from the callee's receipt, and the diagram then says so ("received,
                // no caller was observed") instead of drawing the arrow.
                //
                // The caller is the namespace this orchestrator answers for, not the process:
                // the dispatcher is shared by every namespace that has one, so the process
                // name would credit the hop to whichever namespace happened to be served
                // alongside it.
                //
                // The leg is the method the forwarded call reaches its destination with — the
                // wire name, slash and all (`db/gateway.bundle.find`): that is the method the
                // callee strips back to, and a label that dotted it would no longer be the name
                // the call was made by. Who made it is stated beside the method, not inside it.
                const declared = forwarded;
                const forward = async (): Promise<unknown[] | undefined> =>
                    (await recordedCall(this, declared, () =>
                        remote.dispatch(...params, {...$meta, method: forwarded}),
                    )) as unknown[] | undefined;
                const dispatched = await declareCall(
                    namespaceOf($meta.method),
                    declared,
                    forward,
                    $meta,
                );
                return dispatched?.[0];
            }
        }
    },
}));
