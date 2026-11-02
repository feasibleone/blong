import {randomUUID} from 'node:crypto';

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.persona.add` — write a persona.
 *
 * The defaults are the ones a preset may omit rather than repeat: enabled, the sort order, a workspace
 * the persona claims, the day-long continuation window, and summarising as the compaction level
 * (`@@D-724` for the account it may name, `@@D-728` for the level).
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentPersonaAdd(
        params: {
            personaKey: string;
            title: string;
            description?: string;
            enabled?: boolean;
            sortOrder?: number;
            engineAdapter?: string;
            engineAccount?: string;
            engineMode?: string;
            provider?: string;
            modelName?: string;
            parameters?: string;
            tools?: string;
            disallowedTools?: string;
            instructions?: string;
            workspaceMode?: string;
            maxSteps?: number;
            maxToolCalls?: number;
            continuationMinutes?: number;
            compaction?: string;
            compactionTokens?: number;
            compactionKeep?: number;
            compactionModel?: string;
            greeting?: string;
        },
        _$meta: IMeta,
    ): Promise<{persona: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const personaId = randomUUID();
        const now = new Date();
        const row = {
            personaId: uuidBuf(personaId),
            personaKey: params.personaKey,
            title: params.title,
            description: params.description ?? null,
            enabled: params.enabled === false ? 0 : 1,
            sortOrder: params.sortOrder ?? 0,
            engineAdapter: params.engineAdapter ?? null,
            engineAccount: params.engineAccount ?? null,
            engineMode: params.engineMode ?? null,
            provider: params.provider ?? null,
            modelName: params.modelName ?? null,
            parameters: params.parameters ?? null,
            tools: params.tools ?? null,
            disallowedTools: params.disallowedTools ?? null,
            instructions: params.instructions ?? null,
            workspaceMode: params.workspaceMode ?? 'claim',
            maxSteps: params.maxSteps ?? null,
            maxToolCalls: params.maxToolCalls ?? null,
            continuationMinutes: params.continuationMinutes ?? 1440,
            compaction: params.compaction ?? 'summarize',
            compactionTokens: params.compactionTokens ?? null,
            compactionKeep: params.compactionKeep ?? null,
            compactionModel: params.compactionModel ?? null,
            greeting: params.greeting ?? null,
            createdAt: now,
            updatedAt: now,
        };
        await qb('agent_persona').insert(row);
        return {persona: rowOut({...row, personaId})};
    },
}));
