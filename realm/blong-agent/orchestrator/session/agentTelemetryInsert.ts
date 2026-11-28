import type {IAgentEventBatch, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

// This group's own libraries, next to the handler that uses them: the projection and the ring are
// how the batch is summarised and where it lands when the deployment has no broker (`@@D-1013`).
import {agentSettings, type IAgentDispatchPort} from '../settings.ts';
import {agentMetricProject, type IAgentSessionMetric} from './agentMetricProject.ts';
import {telemetryRingAppend} from './telemetryRing.ts';

/**
 * `agent.telemetry.insert` — one batch of a session's feed, published and summarised (`T-790`).
 *
 * The engine adapter batches what a kind reports and dispatches it here (`@@D-994`). What happens
 * next is the deployment's choice, never a fallback (`@@D-988`):
 *
 * - `kafka` produces one message per event, keyed by the session — so a session's events share a
 *   partition and keep their order (`@@D-987`) — and the *first* batch of a session waits for its
 *   delivery report, because that report is the only place a partition is a fact (`@@D-996`). The
 *   rest are produced without waiting: the key puts them on the same partition, and a batch that
 *   awaited every report would cost a round trip per delta.
 * - `memory` appends to the ring the watch route reads, which is what a Playwright run chooses.
 *
 * Either way the batch is folded into the session's summary here, so the list and the header never
 * replay a topic.
 *
 * This is an orchestrator and not the `db` handler it was first written as: it reads the
 * deployment's choice of sink, publishes the batch, and edits the session row and its metric —
 * steps whose order is the realm's business. An adapter here would have had to call the `kafka`
 * adapter and the `db` adapter for it, which is the shape the layer rule forbids (`@@D-1013`).
 *
 * The topic is not made here. It is declared in `meta/kafka/telemetry.yaml`, and the intent the
 * process runs decides what happens to the declaration — `dev` and `integration` provision it
 * best-effort, `upgrade` refuses to continue without it (`@@D-1001`). A create in this handler was
 * the second door to the same topic, and it is gone on purpose: it repaired a provisioning run that
 * never happened or never reached the broker, so the batch that should have failed loudly was
 * published silently and the missing step stayed missing (`@@D-1040`). A broker with no such topic
 * now answers the send with a timeout, which is reported on the batch as `sourceUnavailable`.
 */
export default handler(
    ({
        handler: {
            // The three `agent.*` methods are answered by the `db` adapter and name it; the
            // `kafka.*` one is the adapter's own namespace and needs no prefix (`@@D-1013`).
            'db/agentSessionEdit': agentSessionEdit,
            'db/agentSessionMetricEdit': agentSessionMetricEdit,
            'db/agentSessionMetricGet': agentSessionMetricGet,
            kafkaMessageSend,
        },
    }) => {
        return {
            async agentTelemetryInsert(
                params: IAgentEventBatch,
                $meta: IMeta,
            ): Promise<{sessionId: string; published: number; partition?: number}> {
                const settings = agentSettings((this as unknown as IAgentDispatchPort).config);
                const events = params.events ?? [];
                if (events.length === 0) return {sessionId: params.sessionId, published: 0};

                let partition: number | undefined;
                let sourceUnavailable: string | undefined;
                try {
                    if (settings.telemetry.source === 'memory') {
                        telemetryRingAppend(params.sessionId, events);
                    } else {
                        const sent = (await kafkaMessageSend(
                            {
                                topic: settings.telemetry.topic,
                                key: params.sessionId,
                                value: JSON.stringify(events[0]),
                                // A broker that has no topic, or no broker at all, must cost a batch the
                                // time a page waits for a frame, not ten seconds a turn.
                                timeoutMs: 2_000,
                            },
                            $meta,
                        )) as {partition?: number} | undefined;
                        partition = sent?.partition;
                        // The rest travel without an answer: the key keeps them on the partition the
                        // first one named, and a failure here is a batch that is missing, not a run
                        // that fails.
                        for (const event of events.slice(1)) {
                            void Promise.resolve(
                                kafkaMessageSend(
                                    {
                                        topic: settings.telemetry.topic,
                                        key: params.sessionId,
                                        value: JSON.stringify(event),
                                        timeoutMs: 2_000,
                                    },
                                    $meta,
                                ),
                            ).catch(() => undefined);
                        }
                        if (partition !== undefined) {
                            await agentSessionEdit(
                                {sessionId: params.sessionId, patch: {kafkaPartition: partition}},
                                $meta,
                            );
                        }
                    }
                } catch (error) {
                    // A broker that is not answering is reported, never fallen back from (`D-988`): the
                    // summary below is still what the list needs, and a page that cannot replay says so.
                    sourceUnavailable = error instanceof Error ? error.message : String(error);
                }

                // The projection is the same either way: what the session adds up to does not depend on
                // which source carried it, so a feed nobody could publish still summarises.
                const stored = (await agentSessionMetricGet(
                    {sessionId: params.sessionId},
                    $meta,
                )) as {
                    metric?: IAgentSessionMetric;
                };
                const metric = agentMetricProject(stored.metric, events);
                await agentSessionMetricEdit({sessionId: params.sessionId, metric}, $meta);

                return {
                    sessionId: params.sessionId,
                    published: sourceUnavailable ? 0 : events.length,
                    ...(partition !== undefined && {partition}),
                    ...(sourceUnavailable && {sourceUnavailable}),
                };
            },
        };
    },
);
