import t from 'tap';

import {
    type ISessionEvent,
    sessionEventsMerge,
    shellOutputOf,
    sessionSectionsOf,
    sessionSectionsOpen,
    sessionSectionsReduce,
} from './sessionSections.ts';

/**
 * The section reducer, pinned without a browser (`@@T-798`).
 *
 * The list a page renders has to be the same however the events arrived — a tail read from the topic
 * and a subscription opened before the first turn are two paths to one state. That equality is the
 * first test here; the rest are the shapes a session takes: a delta appending, a card closing, and
 * only the newest section open.
 */

const script: ISessionEvent[] = [
    {seq: 0, kind: 'status', payload: {state: 'running'}, at: 1_000},
    {seq: 1, kind: 'reasoning', payload: {text: 'Let me '}, at: 1_010},
    {seq: 2, kind: 'reasoning', payload: {text: 'check the file.'}, at: 1_020},
    {
        seq: 3,
        kind: 'tool',
        payload: {toolName: 'bash', toolCallId: 'call-1', args: {cmd: 'ls'}},
        at: 1_030,
    },
    {
        seq: 4,
        kind: 'tool-result',
        payload: {toolCallId: 'call-1', toolName: 'bash', result: 'a.ts\nb.ts'},
        at: 1_040,
    },
    {seq: 5, kind: 'message', payload: {text: 'Two files.'}},
];

t.test('a delta appends to the open section of its kind', async t => {
    const sections = sessionSectionsOf(script.slice(1, 3));
    t.equal(sections.length, 1, 'one reasoning section, not two');
    t.equal(sections[0]?.text, 'Let me check the file.', 'and the deltas are in order');
    t.equal(sections[0]?.kind, 'reasoning', 'under the kind the engine reported');
    t.equal(sessionSectionsOpen(sections), 1, 'the newest section is open');
});

t.test('a tool result closes the card its id names', async t => {
    const sections = sessionSectionsOf(script);
    const tool = sections.find(section => section.kind === 'tool');
    t.ok(tool, 'the call made a card');
    t.equal(tool?.title, 'bash', 'named by the tool');
    t.equal(tool?.done, true, 'and the result closed it');
    t.match(tool?.args ?? '', /cmd/, 'the arguments are kept as text');
    t.match(tool?.result ?? '', /a\.ts/, 'and so is the result');
    t.equal(tool?.open, false, 'a closed card does not show its body');
    t.equal(sections[sections.length - 1]?.open, true, 'the newest section is the open one');
    t.equal(sessionSectionsOpen(sections), 1, 'and only it');
});

t.test('a card with nothing after it is closed to one line, leaving none open', async t => {
    const sections = sessionSectionsOf(script.slice(3, 5));
    t.equal(sections.length, 1, 'one card');
    t.equal(
        sessionSectionsOpen(sections),
        0,
        'and no section is expanded, because the newest answered',
    );
});

t.test('replay then live equals live from the start', async t => {
    const whole = sessionSectionsOf(script);
    const replayed = sessionSectionsOf(script.slice(0, 4));
    const live = sessionSectionsOf(script.slice(4), replayed);
    t.same(live, whole, 'the two paths land on the same list');
});

t.test('a state event shows the words it carries, not the envelope', async t => {
    const sections = sessionSectionsOf([
        {seq: 1, kind: 'status', payload: {state: 'awaiting', question: 'Shall I apply it?'}},
    ]);
    t.equal(sections[0]?.kind, 'note', 'a state is a note');
    t.equal(sections[0]?.title, 'awaiting', 'named by the state it reports');
    t.equal(sections[0]?.text, 'Shall I apply it?', 'and it says what it is waiting for');
});

t.test('a state the status bar already shows is not a row of its own', async t => {
    // `running` and `done` are the bar's business: a pill in the transcript repeated them and pushed
    // the work between them apart (`@@D-1010`).
    for (const state of ['running', 'done'])
        t.equal(
            sessionSectionsOf([{seq: 1, kind: 'status', payload: {state}}]).length,
            0,
            `${state} is on the bar, not in the transcript`,
        );
    // A state nobody can act on but that carries words is still news, and so is a state that stops
    // the run — those are the four the callout is for.
    t.equal(
        sessionSectionsOf([{seq: 2, kind: 'status', payload: {state: 'running', note: 'retrying'}}])
            .length,
        1,
        'a running state with something to say is shown',
    );
    t.equal(
        sessionSectionsOf([{seq: 3, kind: 'status', payload: {state: 'failed'}}])[0]?.title,
        'failed',
        'and a failure is shown even when it says nothing else',
    );
});

t.test('a state says what it carries beside its name, not the envelope', async t => {
    // The first native run's transcript opened with a section titled `running` whose body was
    // `{"state": "running", "mode": "native"}` — the envelope read aloud (`@@T-820`).
    const [running] = sessionSectionsOf([
        {seq: 1, kind: 'status', payload: {state: 'running', mode: 'native'}},
    ]);
    t.equal(running?.title, 'running', 'the state names the row');
    t.equal(running?.text, 'mode native', 'and its other facts are one line, not JSON');
    const [failed] = sessionSectionsOf([
        {seq: 2, kind: 'status', payload: {state: 'failed', error: 'no checkpoint'}},
    ]);
    t.equal(failed?.text, 'error no checkpoint', 'a failure keeps the reason it carries');
    const [bare] = sessionSectionsOf([{seq: 3, kind: 'status', payload: {state: 'failed'}}]);
    t.equal(bare?.text, '', 'and a state with nothing beside it says nothing');
});

t.test('a finished answer is a message, so the page renders its markdown', async t => {
    // The native engine reports its final answer on the status event, and read as a state it was a
    // note: one plain paragraph of literal `##`, tables and fences on screen (`@@T-821`).
    const answer = [
        '## Tour summary',
        '',
        '| step | outcome |',
        '| --- | --- |',
        '| notes | ok |',
        '',
        '```mermaid',
        'graph LR',
        '```',
    ].join('\n');
    const [section] = sessionSectionsOf([
        {seq: 1, kind: 'status', payload: {state: 'finished', text: answer}},
    ]);
    t.equal(section?.kind, 'message', 'the answer is the assistant message, not a state');
    t.equal(section?.text, answer, 'kept verbatim, because markdown is read by the page');
    t.equal(section?.title, undefined, 'a message is not titled by a state');
    t.equal(section?.open, true, 'and it is shown');
    t.equal(
        sessionSectionsOf([{seq: 2, kind: 'status', payload: {state: 'finished'}}]).length,
        0,
        'a finished state with no answer says nothing the status bar does not',
    );
});

t.test('an event delivered twice is kept once', async t => {
    // The page reads a tail and then a subscription, and the two overlap: the repeat became a second
    // section under the same React key, which the browser reports as a duplicate (`@@T-822`).
    const first: ISessionEvent[] = [
        {seq: 1, kind: 'status', payload: {state: 'running', mode: 'native'}},
        {seq: 2, kind: 'text', payload: {text: 'Half a sentence'}},
    ];
    const merged = sessionEventsMerge(first, [
        {seq: 2, kind: 'text', payload: {text: 'Half a sentence'}},
        {seq: 3, kind: 'text', payload: {text: ', and the rest.'}},
    ]);
    t.same(
        merged.map(event => event.seq),
        [1, 2, 3],
        'the overlap is dropped and the new event kept',
    );
    t.equal(
        sessionSectionsOf(merged).find(section => section.kind === 'message')?.text,
        'Half a sentence, and the rest.',
        'so the delta does not appear twice',
    );
    t.same(sessionEventsMerge(first, []).length, 2, 'an empty frame changes nothing');
    t.same(
        sessionEventsMerge(
            [],
            [
                {seq: 4, kind: 'text'},
                {seq: 4, kind: 'text'},
            ],
        ).length,
        1,
        'and a repeat inside one frame is dropped too',
    );
    t.same(
        sessionEventsMerge([], [{kind: 'text'}, {kind: 'text'}]).length,
        2,
        'an event with no seq cannot be told from its twin, so it is kept',
    );
});

t.test('a result with no card of its own is a note, not a lost event', async t => {
    const sections = sessionSectionsOf([
        {seq: 9, kind: 'tool-result', payload: {result: 'orphan'}},
    ]);
    t.equal(sections.length, 1, 'the event is still shown');
    t.equal(sections[0]?.kind, 'note', 'as a note');
});

t.test('an unknown kind is a note rather than silence', async t => {
    const sections = sessionSectionsReduce([], {seq: 1, kind: 'checkpoint', payload: {step: 2}});
    t.equal(sections[0]?.kind, 'note', 'a kind the page does not model is still news');
    t.match(sections[0]?.text ?? '', /step/, 'with the payload it carried');
});

t.test('a section that is not a delta keeps its own key across reductions', async t => {
    const once = sessionSectionsOf(script);
    const twice = sessionSectionsOf(script);
    t.same(
        once.map(section => section.key),
        twice.map(section => section.key),
        'React keys do not churn between two reductions of one stream',
    );
});

t.test('a tool call is read into what it did, not left as JSON', async t => {
    // The copilot runtime names a write's body `file_text` and an edit's sides `old_str`/`new_str`,
    // and a shell's answer ends with a trailer of its own (`@@T-824`).
    const [shell] = sessionSectionsOf([
        {
            seq: 1,
            kind: 'tool',
            payload: {toolName: 'bash', toolCallId: 'c1', arguments: {command: 'echo tour'}},
        },
        {
            seq: 2,
            kind: 'tool-result',
            payload: {
                toolCallId: 'c1',
                shellExecution: {exitCode: 0},
                success: true,
                result: {content: 'tour\n<shellId: 13 completed with exit code 0>'},
            },
        },
    ]);
    t.equal(shell?.detail?.command, 'echo tour', 'the command is the field that holds it');
    t.equal(shell?.detail?.exitCode, 0, 'and the exit code is a number, not a word in the output');
    t.equal(shell?.detail?.output, 'tour', 'the trailer the runtime wrote for itself is gone');
    t.equal(shell?.detail?.success, true, 'and success travels beside it');

    const diff = 'diff --git a/n.md b/n.md\n--- a/n.md\n+++ b/n.md\n@@ -1,2 +1,3 @@\n one\n-two\n+two\n+three\n';
    const [edit] = sessionSectionsOf([
        {
            seq: 3,
            kind: 'tool',
            payload: {
                toolName: 'edit',
                toolCallId: 'c2',
                arguments: {path: '/w/n.md', old_str: 'two', new_str: 'two\nthree'},
            },
        },
        {
            seq: 4,
            kind: 'tool-result',
            payload: {
                toolCallId: 'c2',
                success: true,
                fileEdits: [{path: '/w/n.md', kind: 'edit'}],
                result: {content: 'File /w/n.md updated.', detailedContent: `\n${diff}`},
            },
        },
    ]);
    t.equal(edit?.detail?.path, '/w/n.md', 'the file is named once');
    t.equal(edit?.detail?.oldText, 'two', 'the old side an edit names is kept');
    t.equal(edit?.detail?.newText, 'two\nthree', 'and so is the new one');
    t.match(edit?.detail?.diff ?? '', /\+three/, 'the diff the runtime returned is the body');

    const [ask] = sessionSectionsOf([
        {
            seq: 5,
            kind: 'tool',
            payload: {
                toolName: 'askHuman',
                toolCallId: 'c3',
                arguments: {question: 'Is the tour going well?', options: ['yes', 'no']},
            },
        },
        {
            seq: 6,
            kind: 'tool-result',
            payload: {toolCallId: 'c3', success: true, result: {answerText: 'yes'}},
        },
    ]);
    t.equal(ask?.detail?.question, 'Is the tour going well?', 'a question is prose, not JSON');
    t.same(ask?.detail?.options, ['yes', 'no'], 'with the choices it offered');
    t.equal(ask?.detail?.answer, 'yes', 'and the answer when it came back');
    t.end();
});

t.test('a read is the file, even though the runtime answers with a diff-shaped snapshot', async t => {
    // Measured against runtime 1.0.114: `view` returns the file as `content` and the same text
    // rewritten as a unified diff in `detailedContent`, so a card that read the diff counted a
    // change that did not happen (`@@T-824`).
    const file = '# Tour\n\n- one\n- two\n';
    const [read] = sessionSectionsOf([
        {
            seq: 1,
            kind: 'tool',
            payload: {toolName: 'view', toolCallId: 'c1', arguments: {path: '/w/notes.md'}},
        },
        {
            seq: 2,
            kind: 'tool-result',
            payload: {
                toolCallId: 'c1',
                success: true,
                result: {
                    content: file,
                    detailedContent: '\ndiff --git a/w/notes.md b/w/notes.md\n@@ -1,4 +1,4 @@\n # Tour\n',
                },
            },
        },
    ]);
    t.equal(read?.detail?.content, file, 'the card holds the file itself');
    t.equal(read?.detail?.path, '/w/notes.md', 'named by the argument that asked for it');
    t.end();
});

t.test('a shell trailer is stripped by shape, and a wrapped answer is read out of its JSON', async t => {
    // The runtime names the shell as often as it numbers it, and it hands a custom tool's object back
    // as a string, so a card that looked for a field beside the content found nothing (`@@T-824`).
    t.equal(
        shellOutputOf('mean: 13.2\nmedian: 15\n<shellId: tour completed with exit code 0>'),
        'mean: 13.2\nmedian: 15',
        'a named shell leaves no trailer either',
    );
    const [ask] = sessionSectionsOf([
        {
            seq: 1,
            kind: 'tool',
            payload: {
                toolName: 'askHuman',
                toolCallId: 'c1',
                arguments: {question: 'Is the tour going well?', options: ['yes', 'no']},
            },
        },
        {
            seq: 2,
            kind: 'tool-result',
            payload: {
                toolCallId: 'c1',
                success: true,
                result: {
                    content: '{"promptId":"p-1","answerText":"yes"}',
                    detailedContent: '{"promptId":"p-1","answerText":"yes"}',
                },
            },
        },
    ]);
    t.equal(ask?.detail?.answer, 'yes', 'the answer the person gave reaches the card');
    t.end();
});
