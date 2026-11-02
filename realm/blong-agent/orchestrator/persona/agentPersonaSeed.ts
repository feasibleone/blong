import {handler, type IMeta} from '@feasibleone/blong';

import {agentSettings, type IAgentDispatchPort, type IAgentPersonaPreset} from '../settings.ts';

/**
 * `agent.persona.seed` — write the personas the deployment declares.
 *
 * It runs on every start, dispatched by `meta/db/agentPersonaSeed.yaml`, and inserts only what is
 * absent: a preset is a starting point, so a row a person edited is left exactly as it is, and the way
 * to re-apply a changed preset is `overwrite` rather than a restart (`@@D-726`).
 *
 * It is also what a conversation calls when it finds no persona at all: a process that is not an
 * `upgrade` or a `dev` run does not dispatch the seed phase, and a channel that is asked which persona
 * to use has to have something to ask about.
 *
 * Which is why this is a handler and not a seed file: the presets are config, and the seed dispatches
 * the method rather than carrying the rows.
 */
export interface IAgentPersonaSeedParams {
    /** Re-apply every preset over its row, discarding local edits. */
    overwrite?: boolean;
}

export default handler(
    ({
        handler: {
            'db/agentPersonaFind': agentPersonaFind,
            'db/agentPersonaAdd': agentPersonaAdd,
            'db/agentPersonaEdit': agentPersonaEdit,
        },
    }) => ({
        async agentPersonaSeed(
            params: IAgentPersonaSeedParams,
            $meta: IMeta,
        ): Promise<{added: string[]; updated: string[]; kept: string[]}> {
            const port = this as unknown as IAgentDispatchPort;
            const presets = agentSettings(port.config).personaPresets;
            const added: string[] = [];
            const updated: string[] = [];
            const kept: string[] = [];
            for (const [personaKey, preset] of Object.entries(presets ?? {})) {
                if (!preset?.title) continue;
                const found = (await agentPersonaFind({personaKey, limit: 1}, $meta)) as {
                    personas?: Array<Record<string, unknown>>;
                };
                const existing = found.personas?.[0];
                if (!existing) {
                    await agentPersonaAdd({personaKey, ...personaRow(preset)}, $meta);
                    added.push(personaKey);
                    continue;
                }
                if (!params?.overwrite) {
                    kept.push(personaKey);
                    continue;
                }
                await agentPersonaEdit(
                    {
                        personaId: String(existing.personaId),
                        patch: personaRow(preset) as never,
                    },
                    $meta,
                );
                updated.push(personaKey);
            }
            return {added, updated, kept};
        },
    }),
);

/**
 * A preset as the row's own vocabulary.
 *
 * The two collection fields are JSON in the table and lists in the config, which is the only conversion
 * the merge makes: everything else a preset states is a column of the same name.
 */
const personaRow = (preset: IAgentPersonaPreset) => ({
    title: preset.title,
    ...(preset.description !== undefined && {description: preset.description}),
    ...(preset.enabled !== undefined && {enabled: preset.enabled}),
    ...(preset.sortOrder !== undefined && {sortOrder: preset.sortOrder}),
    ...(preset.engineAdapter !== undefined && {engineAdapter: preset.engineAdapter}),
    ...(preset.engineAccount !== undefined && {engineAccount: preset.engineAccount}),
    ...(preset.engineMode !== undefined && {engineMode: preset.engineMode}),
    ...(preset.provider !== undefined && {provider: preset.provider}),
    ...(preset.modelName !== undefined && {modelName: preset.modelName}),
    ...(preset.parameters !== undefined && {parameters: JSON.stringify(preset.parameters)}),
    ...(preset.tools !== undefined && {tools: JSON.stringify(preset.tools)}),
    ...(preset.disallowedTools !== undefined && {
        disallowedTools: JSON.stringify(preset.disallowedTools),
    }),
    ...(preset.instructions !== undefined && {instructions: preset.instructions}),
    ...(preset.workspaceMode !== undefined && {workspaceMode: preset.workspaceMode}),
    ...(preset.maxSteps !== undefined && {maxSteps: preset.maxSteps}),
    ...(preset.maxToolCalls !== undefined && {maxToolCalls: preset.maxToolCalls}),
    ...(preset.continuationMinutes !== undefined && {
        continuationMinutes: preset.continuationMinutes,
    }),
    ...(preset.compaction !== undefined && {compaction: preset.compaction}),
    ...(preset.compactionTokens !== undefined && {compactionTokens: preset.compactionTokens}),
    ...(preset.compactionKeep !== undefined && {compactionKeep: preset.compactionKeep}),
    ...(preset.compactionModel !== undefined && {compactionModel: preset.compactionModel}),
    ...(preset.greeting !== undefined && {greeting: preset.greeting}),
});
