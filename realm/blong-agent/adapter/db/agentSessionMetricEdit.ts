import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import type {IAgentSessionMetric} from '../../orchestrator/session/agentMetricProject.ts';

/**
 * `agent.session.metric.edit` — fold a batch of telemetry into the session's summary (`T-791`).
 *
 * The projector runs here, beside the insert that publishes the batch, rather than as a consumer of
 * the topic: the events are already in this process, and a second consumer would add a group member
 * to every deployment to re-read what it just wrote (`@@D-1002`). The row is what a list and a
 * header read, so neither replays anything (`@@D-992`).
 *
 * It is an upsert on the session id: the first batch creates the row, the nine-hundredth updates it,
 * and a replayed batch after a restart projects onto what is stored rather than starting over.
 */
export default handler(({lib: {uuidBuf}}) => ({
    async agentSessionMetricEdit(
        params: {sessionId: string; metric: IAgentSessionMetric},
        _$meta: IMeta,
    ): Promise<{sessionId: string; metric: IAgentSessionMetric}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const metric = params.metric;
        const row = {
            sessionId: uuidBuf(params.sessionId),
            turnCount: metric.turnCount,
            messageTokens: metric.messageTokens,
            toolCount: metric.toolCount,
            toolsJSON: JSON.stringify(metric.tools),
            lastEventAt: new Date(metric.lastEventAt || Date.now()),
            updatedAt: new Date(),
        };
        await qb('agent_sessionMetric').insert(row).onConflict(['sessionId']).merge();
        return {sessionId: params.sessionId, metric};
    },

    /** What the summary is now, or the empty one a first batch projects onto. */
    async agentSessionMetricGet(
        params: {sessionId: string},
        _$meta: IMeta,
    ): Promise<{metric?: IAgentSessionMetric}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const row = (await qb('agent_sessionMetric')
            .where('sessionId', uuidBuf(params.sessionId))
            .first()) as
            | {
                  turnCount?: number;
                  messageTokens?: number;
                  toolCount?: number;
                  toolsJSON?: string | IAgentSessionMetric['tools'];
                  lastEventAt?: Date | string;
              }
            | undefined;
        if (!row) return {};
        // A JSON column comes back parsed on some drivers and as text on others; both are the map.
        const tools =
            typeof row.toolsJSON === 'string'
                ? (JSON.parse(row.toolsJSON) as IAgentSessionMetric['tools'])
                : ((row.toolsJSON ?? {}) as IAgentSessionMetric['tools']);
        return {
            metric: {
                turnCount: Number(row.turnCount ?? 0),
                messageTokens: Number(row.messageTokens ?? 0),
                toolCount: Number(row.toolCount ?? 0),
                tools,
                lastEventAt: new Date(row.lastEventAt ?? 0).getTime(),
            },
        };
    },
}));
