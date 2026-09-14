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

import {bindLeg} from '../src/context.ts';
import {decide} from '../src/decide.ts';
import {hop, type Participant} from './participant.ts';

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
    const {logger, app} = participant;
    const reachable = options.hubBUrl.length > 0;

    for (const {path, phase, leg} of ROUTES) {
        app.post(path, async (request, reply) => {
            const traceId = participant.traceFrom(request);
            const flowId = participant.flowFrom(request);
            const inbound = participant.legFrom(request);
            const result = await participant.run(traceId, flowId, inbound, () =>
                participant.phase(phase, async () => {
                    // The receipt belongs to the *caller's* leg — this is the far end of
                    // the scheme's call. It comes before the routing decision so that the
                    // rationale that decision records still attaches to the record that
                    // reports the routing, which is the record it explains (PRD R11/R22).
                    logger.info('corridor request received', {
                        req: {operation: 'POST', target: path},
                    });
                    const route = decide('route-selection', {corridor: TARGET, reachable}, [
                        {
                            name: TARGET,
                            when: values => values.reachable === true,
                            run: () => options.hubBUrl,
                        },
                        {name: 'hold', when: () => true, run: () => undefined},
                    ]);
                    if (!route) {
                        logger.error('no route to the target ecosystem', {
                            err: {message: `corridor ${TARGET} is not configured`},
                        });
                        return {status: 503, body: {reason: 'no route to target ecosystem'}};
                    }
                    const forwarded = await bindLeg({id: leg, to: TARGET}, async () => {
                        logger.info('routing to target ecosystem', {
                            req: {operation: 'POST', target: path},
                            corridor: TARGET,
                        });
                        return hop(participant, route, path, request.body);
                    });
                    return {status: forwarded.status, body: forwarded.body};
                }),
            );
            reply.status(result.status);
            return result.body;
        });
    }
}
