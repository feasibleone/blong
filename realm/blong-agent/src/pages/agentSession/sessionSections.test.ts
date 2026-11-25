import t from 'tap';

import {
    type ISessionEvent,
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
