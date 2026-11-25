import {randomUUID} from 'node:crypto';

import type {IAgentEventBatch, IAgentTelemetryEvent, IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The conversation the session page is tested against (`@@T-801`).
 *
 * A browser run needs a session with a known transcript, and it cannot make one: the page's routes
 * are the realm's own, and a real turn needs an engine. So this group writes one — the row through
 * `agent.session.add`, the events through `agent.telemetry.insert`, which in the `playwright` intent
 * is configured to publish into the memory ring (`@@D-988`). The page then reads both routes exactly
 * as it does in a deployment, with nothing in it knowing a test is running (`@@D-1008`).
 *
 * The script is the whole set of things a reader has to see: a call that opened, reasoning, a tool
 * call with arguments and its result, a message carrying markdown with a table, a mermaid diagram and
 * three code blocks — TypeScript, a diff and a shell command — and a closing message. It is one step, because what the browser waits for is the
 * transcript, not the steps it took to write it.
 */
export default handler(context => {
    const {group} = context.lib;
    const {agentSessionAdd, agentSessionMetricEdit, agentSessionEdit, agentTelemetryInsert} =
        context.handler;

    /** The markdown a message carries: a table, a diagram and two fences. */
    const markdown = [
        '## Result',
        '',
        'Two files changed. The table below is what the work moved.',
        '',
        '| file | lines |',
        '| ---- | ----- |',
        '| `src/a.ts` | 12 |',
        '| `src/b.ts` | 4 |',
        '',
        'The call graph is short:',
        '',
        '```mermaid',
        // Left to right, because a diagram that stacks takes the height the prose beside it needs:
        // the picture is a way to check the shape, not the answer.
        'graph LR;',
        '  worker-->session;',
        '  session-->topic;',
        '```',
        '',
        'And the code that publishes it:',
        '',
        // A comment that spans two lines, because a fence highlighted a line at a time coloured the
        // second line as code: the fence is tokenized in one call and then cut (`@@D-1011`).
        '```ts',
        '/* the publish path — two lines, so the',
        '   comment has to be one comment */',
        'await agentTelemetryInsert({sessionId, events}, $meta);',
        '```',
        '',
        // A diff, because it is the one fence a coding session shows more often than code: the
        // added and the removed line are the two colours the transcript did not have.
        'Nothing else changed:',
        '',
        '```diff',
        '+ await agentTelemetryInsert({sessionId, events}, $meta);',
        '- await dispatch(events, sessionId);',
        '```',
        '',
        'And the command that says so:',
        '',
        '```bash',
        'git diff --stat',
        '```',
        '',
        'That is everything.',
    ].join('\n');

    return {
        testAgentUi: ({name = 'agent session ui'}: {name?: string} = {}) =>
            group(name)([
                async function seedConversation(assert: IAssert) {
                    const $meta = {} as IMeta;
                    const sessionId = randomUUID();
                    const at = Date.now();
                    await agentSessionAdd(
                        {
                            sessionId,
                            ticketId: `T-${sessionId.slice(0, 8)}`,
                            ticketTitle: 'Render the session',
                            status: 'done',
                            engineAdapter: 'engine',
                            engineAccount: 'sim',
                            engineMode: 'step',
                            modelName: 'sim',
                            workerId: 'ui-test',
                            // The directory the calls name, so the page shortens their paths to
                            // the workspace rather than repeating the prefix on every row
                            // (`@@T-820`).
                            workspacePath: '/var/lib/blong/workspaces',
                        },
                        $meta,
                    );

                    const said = (
                        seq: number,
                        kind: IAgentTelemetryEvent['kind'],
                        payload?: unknown,
                    ): IAgentTelemetryEvent => ({
                        sessionId,
                        seq,
                        kind,
                        ...(payload === undefined ? {} : {payload}),
                        at: at + seq * 100,
                    });
                    const fileDiff = [
                        'diff --git a/src/a.ts b/src/a.ts',
                        'index 0000000..0000000 100644',
                        '--- a/src/a.ts',
                        '+++ b/src/a.ts',
                        '@@ -1,3 +1,3 @@',
                        ' const sessionId = randomUUID();',
                        '-await dispatch(events, sessionId);',
                        '+await agentTelemetryInsert({sessionId, events}, $meta);',
                        ' return sessionId;',
                    ].join('\n');
                    const events: IAgentTelemetryEvent[] = [
                        said(0, 'status', {state: 'running'}),
                        said(1, 'reasoning', {text: 'The change touches two files. '}),
                        said(2, 'reasoning', {text: 'Let me check what moved.'}),
                        // A run of three calls, because a run is what a tool card has to summarise:
                        // one call would show a card and prove nothing about grouping (`@@D-1010`).
                        // The three are the shapes a row has to draw — a shell that took fifteen
                        // seconds and worked, an edit with a diff, a shell that failed — and the
                        // payloads are the runtime's own (`@@T-824`, `@@T-827`).
                        said(3, 'tool', {
                            toolName: 'bash',
                            toolCallId: 'call-1',
                            arguments: {command: 'git diff --stat', description: 'Show what moved'},
                        }),
                        said(4, 'tool-result', {
                            toolName: 'bash',
                            toolCallId: 'call-1',
                            // Forty-five seconds: the one duration on the page that the reader is
                            // meant to notice, and the case the page marks (`@@T-827`).
                            durationMs: 45_004,
                            success: true,
                            shellExecution: {exitCode: 0},
                            result: {
                                content:
                                    'src/a.ts | 12 ++\nsrc/b.ts |  4 +\n<shellId: tour completed with exit code 0>',
                            },
                        }),
                        said(5, 'tool', {
                            toolName: 'edit',
                            toolCallId: 'call-2',
                            arguments: {
                                path: '/var/lib/blong/workspaces/src/a.ts',
                                old_str: 'await dispatch(events, sessionId);',
                                new_str: 'await agentTelemetryInsert({sessionId, events}, $meta);',
                            },
                        }),
                        said(6, 'tool-result', {
                            toolName: 'edit',
                            toolCallId: 'call-2',
                            durationMs: 180,
                            success: true,
                            fileEdits: [{path: '/var/lib/blong/workspaces/src/a.ts', kind: 'edit'}],
                            result: {
                                content: 'File updated.',
                                detailedContent: `\n${fileDiff}`,
                            },
                        }),
                        said(7, 'tool', {
                            toolName: 'bash',
                            toolCallId: 'call-3',
                            arguments: {command: 'git diff --check', description: 'Check whitespace'},
                        }),
                        said(8, 'tool-result', {
                            toolName: 'bash',
                            toolCallId: 'call-3',
                            durationMs: 420,
                            success: false,
                            shellExecution: {exitCode: 1},
                            result: {content: 'src/a.ts:12: trailing whitespace.'},
                        }),
                        // A message ends the run, which is what makes the next call its own card.
                        said(9, 'message', {text: 'The check found a trailing space.'}),
                        said(10, 'tool', {
                            toolName: 'view',
                            toolCallId: 'call-4',
                            arguments: {path: '/var/lib/blong/workspaces/src/a.ts'},
                        }),
                        said(11, 'tool-result', {
                            toolName: 'view',
                            toolCallId: 'call-4',
                            durationMs: 69,
                            success: true,
                            result: {content: 'const sessionId = randomUUID();\nreturn sessionId;\n'},
                        }),
                        // The human-in-the-loop beat: the turn stops and asks, and a second status
                        // opens the turn that answered.
                        said(12, 'status', {
                            state: 'awaiting',
                            question: 'Shall I apply the change?',
                        }),
                        said(13, 'status', {state: 'running'}),
                        // The question as the page draws it: the card carries the choices and the
                        // answer a person gave (`@@T-824`).
                        said(14, 'tool', {
                            toolName: 'askHuman',
                            toolCallId: 'call-5',
                            arguments: {
                                question: 'Shall I fix the trailing space?',
                                options: ['yes', 'no'],
                            },
                        }),
                        said(15, 'tool-result', {
                            toolName: 'askHuman',
                            toolCallId: 'call-5',
                            durationMs: 60,
                            success: true,
                            result: {content: '{"promptId":"p-1","answerText":"yes"}'},
                        }),
                        said(16, 'tool', {
                            toolName: 'create',
                            toolCallId: 'call-6',
                            arguments: {
                                path: '/var/lib/blong/workspaces/src/b.ts',
                                file_text: 'export const moved = true;\n',
                            },
                        }),
                        said(17, 'tool-result', {
                            toolName: 'create',
                            toolCallId: 'call-6',
                            durationMs: 85,
                            success: true,
                            fileEdits: [
                                {path: '/var/lib/blong/workspaces/src/b.ts', kind: 'create'},
                            ],
                            result: {
                                content: 'Created src/b.ts with 26 characters',
                                detailedContent:
                                    '\ndiff --git a/src/b.ts b/src/b.ts\n--- a/dev/null\n+++ b/src/b.ts\n@@ -1,0 +1,1 @@\n+export const moved = true;\n',
                            },
                        }),
                        // One event carries the whole answer: consecutive `message` events are deltas
                        // of one message, which is what the page's reducer assumes, so a second one
                        // would be glued to the first with no separator.
                        said(18, 'message', {text: markdown}),
                    ];

                    const published = (await agentTelemetryInsert(
                        {sessionId, events} as IAgentEventBatch,
                        $meta,
                    )) as {published?: number};
                    assert.equal(
                        published.published,
                        events.length,
                        'the scripted conversation reached the source the page reads',
                    );
                    // The carried partition belongs to a topic; the ring has none, and writing one
                    // would tell the page to read a partition that does not exist.
                    await agentSessionEdit(
                        {
                            sessionId,
                            patch: {
                                kafkaPartition: null,
                                // An hour before the run, so the page's relative "activity" cell reads
                                // the same on every run: a snapshot that pinned "2s ago" would fail on
                                // the next one for a reason the page is right about.
                                lastActivityAt: new Date(at - 3_600_000).toISOString(),
                            },
                        },
                        $meta,
                    );
                    await agentSessionMetricEdit(
                        {
                            sessionId,
                            metric: {
                                turnCount: 2,
                                messageTokens: 420,
                                toolCount: 3,
                                tools: {bash: {count: 2, durationMs: 620}, edit: {count: 1, durationMs: 180}},
                                lastEventAt: at + 600,
                            },
                        },
                        $meta,
                    );
                    return {sessionId};
                },
            ]),
    };
});
