import {schema} from '@feasibleone/blong';

/**
 * `meta/type/schema.ts` — the four tables a resume has to find again.
 *
 * The ticket is deliberately absent: the pool belongs to `blong-task`, and this realm reaches it
 * through the task adapter (`@@D-707`). What is here is what only this realm knows — the run, the step
 * boundary, the answer a worker missed, and the trace.
 *
 * `checkedAt` style timestamps are nullable only where the value arrives later (`consumedAt`,
 * `completedAt`), because the gateway validates CRUD params against the `NotNull` columns.
 */
export default schema(async ({lib: {type}}) => ({
    /**
     * A persona is everything one needs to work: the harness, the model and its parameters, the tools it
     * may use, the ceilings it runs under, its instructions, and how long a conversation with it stays
     * one conversation. It names an engine account and never a secret (@@D-724).
     */
    persona: type.Object(
        {
            personaId: type.uuid(),
            /** The slug config, the slash command and a channel binding all name. */
            personaKey: type.stringNotNull({maxLength: 64}),
            title: type.stringNotNull({maxLength: 128}),
            description: type.stringNull({maxLength: 512}),
            enabled: type.booleanNotNull(),
            sortOrder: type.integerNotNull(),
            /** Absent means the realm default, so a persona may only change the model and the tools. */
            engineAdapter: type.stringNull({maxLength: 64}),
            engineAccount: type.stringNull({maxLength: 64}),
            engineMode: type.stringNull({maxLength: 16}),
            provider: type.stringNull({maxLength: 32}),
            modelName: type.stringNull({maxLength: 128}),
            /** A JSON object merged over the account's own parameters. */
            parameters: type.stringNull({maxLength: 8000}),
            /** A JSON array of tool names; `[]` is a toolless persona and null is every tool. */
            tools: type.stringNull({maxLength: 4000}),
            disallowedTools: type.stringNull({maxLength: 4000}),
            instructions: type.stringNull({maxLength: 8000}),
            /** `none` or `claim`: a toolless chat persona owns no workspace. */
            workspaceMode: type.stringNotNull({maxLength: 16}),
            maxSteps: type.integerNull(),
            maxToolCalls: type.integerNull(),
            /** How long a channel keeps one session before the next message starts another. */
            continuationMinutes: type.integerNotNull(),
            /** `summarize` by default, or `prune`, `restart`, `off` (@@D-728). */
            compaction: type.stringNotNull({maxLength: 16}),
            compactionTokens: type.integerNull(),
            compactionKeep: type.integerNull(),
            /** A cheaper model for the summary; null uses the persona's own. */
            compactionModel: type.stringNull({maxLength: 128}),
            greeting: type.stringNull({maxLength: 2000}),
            createdAt: type.dateTimeNotNull(),
            updatedAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'personaId',
                unique: {personaKey: {columns: ['personaKey']}},
                index: {enabled: {}, sortOrder: {}},
            },
        },
    ),

    session: type.Object(
        {
            sessionId: type.uuid(),
            /** The task adapter's own id, not a foreign key: the pool lives elsewhere. */
            ticketId: type.stringNull({maxLength: 64}),
            ticketTitle: type.stringNull({maxLength: 255}),
            /** `ticket` or `chat`: why the session exists, which decides who answers it. */
            source: type.stringNull({maxLength: 16}),
            /** The persona a chat session runs under; a ticket session may have one too. */
            personaId: type.uidNull(),
            /** The conversation this session belongs to, as the chat realm keys it. */
            channelKey: type.stringNull({maxLength: 255}),
            /** `claimed`, `running`, `awaiting`, `suspended`, `done`, `failed`. */
            status: type.stringNotNull({maxLength: 32}),
            /** The adapter instance that ran it, then the account inside that instance (`@@D-712`). */
            engineAdapter: type.stringNotNull({maxLength: 64}),
            engineAccount: type.stringNotNull({maxLength: 64}),
            /** `step` or `native`: who owns the tool loop (`@@D-708`). */
            engineMode: type.stringNotNull({maxLength: 16}),
            modelName: type.stringNull({maxLength: 128}),
            /** The DeepSeek Harness session a native mode resumes through (`@@D-711`). */
            engineSessionId: type.stringNull({maxLength: 128}),
            /** The host that holds the workspace: only this worker may resume the session. */
            workerId: type.stringNotNull({maxLength: 128}),
            /** Null when the persona claims no workspace, which is what a toolless chat persona does. */
            workspacePath: type.stringNull({maxLength: 1000}),
            baseCommit: type.stringNull({maxLength: 64}),
            turnCount: type.integerNull(),
            lastActivityAt: type.dateTimeNull(),
            compactedAt: type.dateTimeNull(),
            compactionCount: type.integerNull(),
            lastEventAt: type.dateTimeNull(),
            createdAt: type.dateTimeNotNull(),
            updatedAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'sessionId',
                index: {
                    ticketId: {},
                    status: {},
                    workerId: {},
                    channelKey: {},
                    personaId: {},
                },
            },
        },
    ),

    checkpoint: type.Object(
        {
            checkpointId: type.uuid(),
            sessionId: type.uidNotNull(),
            sequence: type.integerNotNull(),
            /** The neutral transcript, so any step engine can resume any other (`@@D-708`). */
            historyJSON: type.stringNotNull({maxLength: 8000000}),
            /** Written before the question is asked, so a cold answer can be matched to it. */
            pendingPromptId: type.stringNull({maxLength: 64}),
            pendingToolCallId: type.stringNull({maxLength: 64}),
            pendingQuestionText: type.stringNull({maxLength: 4000}),
            stepCount: type.integerNotNull(),
            createdAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'checkpointId',
                unique: {
                    sessionSequence: {columns: ['sessionId', 'sequence']},
                },
                index: {
                    sessionId: {},
                },
                foreign: {
                    sessionId: 'agent.session.sessionId',
                },
            },
        },
    ),

    answer: type.Object(
        {
            answerId: type.uuid(),
            /** Unique: a platform retrying a click must not answer twice (`@@D-702`). */
            promptId: type.stringNotNull({maxLength: 64}),
            ticketId: type.stringNotNull({maxLength: 64}),
            /** Null when the answer arrived before its session could be matched. */
            sessionId: type.uidNull(),
            answerText: type.stringNotNull({maxLength: 8000}),
            senderName: type.stringNull({maxLength: 255}),
            receivedAt: type.dateTimeNotNull(),
            consumedAt: type.dateTimeNull(),
        },
        {
            constraints: {
                primaryKey: 'answerId',
                unique: {
                    promptId: {},
                },
                index: {
                    sessionId: {},
                    consumedAt: {},
                },
                foreign: {
                    sessionId: 'agent.session.sessionId',
                },
            },
        },
    ),

    event: type.Object(
        {
            eventId: type.uuid(),
            sessionId: type.uidNotNull(),
            sequence: type.integerNotNull(),
            /** `step`, `tool`, `command`, `ask`, `answer`, `suspend`, `resume`, `recover`. */
            kind: type.stringNotNull({maxLength: 32}),
            payloadJSON: type.stringNull({maxLength: 8000}),
            createdAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'eventId',
                index: {
                    sessionId: {},
                },
                foreign: {
                    sessionId: 'agent.session.sessionId',
                },
            },
        },
    ),
}));
