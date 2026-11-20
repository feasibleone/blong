/**
 * Proxy adapter — the cross-border link.
 *
 * Its one job is to pick the receiving scheme a corridor is carried to, and to
 * record *why*. It is the hop the inter-scheme topology adds and the one an
 * operator blames first when a cross-border transfer fails, so the record has to
 * name the alternative that was considered and the reason it was not taken —
 * "routed to hubB" alone would not let anyone replay the choice (PRD R11).
 *
 * Reachability is a **deployment property**, like the faults: a proxy whose
 * receiving link is not configured has no route and must hold rather than
 * forward into an address it was never given. The corridor being down is a state
 * a deployment meets, so this is a real branch and not a guard against something
 * that never happens; it is exercised by deploying the proxy with no link at all
 * (see `guards.test.ts`), because no run of `startFlow` configures one without.
 *
 * The status is set on the reply explicitly; a returned `{status, body}` object
 * would be answered with HTTP 200 by fastify, so a hold could never leave this
 * participant (see `payer.ts` for the full note).
 */

import {declare} from '../index.ts';
import {bindLeg} from '../src/context.ts';
import {decide} from '../src/decide.ts';
import {hop, type Participant} from './participant.ts';

/**
 * What the adapter reports — the call it was handed, and the route it chose or could not.
 *
 * The two routing names are the arms of `route-selection`, and the third is the receipt every call
 * gets before the decision: a hold with no record of what was considered would be exactly the failure
 * PRD R11 exists to prevent, so the arm that holds names the corridor it could not reach (`@@D-889`).
 */
export const proxyVocabulary = declare({
    log: {
        /** A corridor call arrived and was handed to the routing decision. */
        proxyCorridorRequestReceived: {
            level: 'info',
            message: 'corridor request received for {target}',
        },
        /** The corridor is reachable, so the call is forwarded to the receiving scheme. */
        proxyRoutingToTarget: {
            level: 'info',
            message: 'routing to {target} over the {corridor} corridor',
        },
        /** The corridor is not configured, so the call is held rather than lost. */
        proxyNoRouteToTarget: {
            level: 'error',
            message: 'no route to {target}: corridor {corridor} is not configured',
        },
    },
    decision: {
        routeSelection: {
            message: 'which ecosystem a corridor call is carried to',
            branch: {
                hubB: 'the receiving scheme is reachable, so the call is forwarded to it',
                hold: 'no corridor is configured, so the call is held rather than lost',
            },
        },
    },
});

/** The receiving scheme this proxy is deployed to reach. */
const TARGET = 'hubB';

export interface ProxyOptions {
    /**
     * The receiving scheme's switch. An empty string means the corridor is not
     * configured, and the proxy holds instead of forwarding.
     */
    hubBUrl: string;
}

/**
 * The three protocol steps a transfer makes, in order, each with the phase name
 * the rest of the topology uses for it. Deriving the phase from the path (say, by
 * trimming the slashes off `/parties`) would name the discovery step after a
 * truncated path segment and put this participant's records in a phase of their
 * own — so the pairing is written out, not computed from the URL.
 */
const ROUTES = [
    {path: '/parties', phase: 'discovery', leg: 'proxy.discovery.corridor'},
    {path: '/quotes', phase: 'quote', leg: 'proxy.quote.corridor'},
    {path: '/transfers', phase: 'transfer', leg: 'proxy.transfer.corridor'},
] as const;

export function installProxy(participant: Participant, options: ProxyOptions): void {
    const {signal, app} = participant;
    const reachable = options.hubBUrl.length > 0;

    for (const {path, phase, leg} of ROUTES) {
        app.post(path, async (request, reply) => {
            const traceId = participant.traceFrom(request);
            const flowId = participant.flowFrom(request);
            const inbound = participant.legFrom(request);
            const result = await participant.run(traceId, flowId, inbound, () =>
                participant.phase(phase, async () => {
                    // The receipt belongs to the *caller's* leg — this is the far end of
                    // the scheme's call — so it is emitted before the routing decision and
                    // stays outside every branch: it is not a record this proxy chose to
                    // make, it is the far end acknowledging the call it was handed.
                    signal?.proxyCorridorRequestReceived?.({target: path});
                    // The decision's work happens *inside* its branches, so the calls it
                    // chose are drawn inside the `alt` block rather than beside it
                    // (PRD R26/R27).
                    const forwarded = await decide(
                        proxyVocabulary.decision.routeSelection,
                        {corridor: TARGET, reachable},
                        [
                            {
                                name: TARGET,
                                when: values => values.reachable === true,
                                run: () =>
                                    bindLeg(
                                        // The id is the method the call was addressed by,
                                        // carried on from the inbound leg; the proxy answers
                                        // for this ecosystem, so it is the unit the next hop
                                        // is declared by.
                                        {id: leg, from: participant.name, to: TARGET},
                                        async () => {
                                            signal?.proxyRoutingToTarget?.({
                                                target: path,
                                                corridor: TARGET,
                                            });
                                            return hop(
                                                participant,
                                                options.hubBUrl,
                                                path,
                                                request.body,
                                            );
                                        },
                                    ),
                            },
                            {
                                name: 'hold',
                                when: () => true,
                                run: () => {
                                    signal?.proxyNoRouteToTarget?.({
                                        target: path,
                                        corridor: TARGET,
                                    });
                                    return undefined;
                                },
                            },
                        ],
                    );
                    if (!forwarded) {
                        return {status: 503, body: {reason: 'no route to target ecosystem'}};
                    }
                    return {status: forwarded.status, body: forwarded.body};
                }),
            );
            reply.status(result.status);
            return result.body;
        });
    }
}
