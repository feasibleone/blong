import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.persona.edit` — change a persona a deployment shipped.
 *
 * A preset is inserted once and never overwritten, so this is how a row a person tuned survives the
 * next start while the preset it came from stays in the config (`@@D-726`). A field is written only
 * when the caller named it, so `undefined` keeps the stored value and `null` clears it.
 */
export default handler(({lib: {uuidBuf}}) => ({
    async agentPersonaEdit(
        params: {
            personaId: string;
            patch: {
                title?: string;
                description?: string | null;
                enabled?: boolean;
                sortOrder?: number;
                engineAdapter?: string | null;
                engineAccount?: string | null;
                engineMode?: string | null;
                provider?: string | null;
                modelName?: string | null;
                parameters?: string | null;
                tools?: string | null;
                disallowedTools?: string | null;
                instructions?: string | null;
                workspaceMode?: string;
                maxSteps?: number | null;
                maxToolCalls?: number | null;
                continuationMinutes?: number;
                compaction?: string;
                compactionTokens?: number | null;
                compactionKeep?: number | null;
                compactionModel?: string | null;
                greeting?: string | null;
            };
        },
        _$meta: IMeta,
    ): Promise<{updated: boolean}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const row: Record<string, unknown> = {updatedAt: new Date()};
        for (const [key, value] of Object.entries(params.patch ?? {})) {
            if (value !== undefined) row[key] = typeof value === 'boolean' ? Number(value) : value;
        }
        const updated = await qb('agent_persona')
            .where('personaId', uuidBuf(params.personaId))
            .update(row);
        return {updated: Number(updated) > 0};
    },
}));
