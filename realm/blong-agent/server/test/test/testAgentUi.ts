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
                            // The column is not nullable in a table the sync only widens.
                            workspacePath: '',
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
                    const events: IAgentTelemetryEvent[] = [
                        said(0, 'status', {state: 'running'}),
                        said(1, 'reasoning', {text: 'The change touches two files. '}),
                        said(2, 'reasoning', {text: 'Let me check what moved.'}),
                        // A run of three calls, because a run is what a tool card has to summarise:
                        // one call would show a card and prove nothing about grouping (`@@D-1010`).
                        said(3, 'tool', {
                            toolName: 'bash',
                            toolCallId: 'call-1',
                            args: {command: 'git diff --stat'},
                        }),
                        said(4, 'tool-result', {
                            toolName: 'bash',
                            toolCallId: 'call-1',
                            durationMs: 420,
                            result: 'src/a.ts | 12 ++\nsrc/b.ts |  4 +',
                        }),
                        said(5, 'tool', {
                            toolName: 'edit',
                            toolCallId: 'call-2',
                            args: {path: 'src/a.ts', find: 'oldName', replace: 'newName'},
                        }),
                        said(6, 'tool-result', {
                            toolName: 'edit',
                            toolCallId: 'call-2',
                            durationMs: 180,
                            result: 'replaced 3 occurrences',
                        }),
                        said(7, 'tool', {
                            toolName: 'bash',
                            toolCallId: 'call-3',
                            args: {command: 'git diff --check'},
                        }),
                        said(8, 'tool-result', {
                            toolName: 'bash',
                            toolCallId: 'call-3',
                            durationMs: 200,
                            result: '',
                        }),
                        // The human-in-the-loop beat: the turn stops and asks, and a second status
                        // opens the turn that answered. It is what a session that needed a person
                        // looks like, and what the page draws as a callout rather than a card.
                        said(9, 'status', {
                            state: 'awaiting',
                            question: 'Shall I apply the change?',
                        }),
                        said(10, 'status', {state: 'running'}),
                        // One event carries the whole answer: consecutive `message` events are deltas
                        // of one message, which is what the page's reducer assumes, so a second one
                        // would be glued to the first with no separator.
                        said(11, 'message', {text: markdown}),
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
