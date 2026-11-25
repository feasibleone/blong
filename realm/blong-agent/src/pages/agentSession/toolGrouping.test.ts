import t from 'tap';

import {sessionSectionsOf, type ISessionEvent, type ISessionSection as ICodeSection} from './sessionSections.ts';
import {
    elapsedOf,
    isSlow,
    languageOfPath,
    sessionRowsOf,
    toolKindOf,
    toolRunSummary,
    toolStatsOf,
} from './toolGrouping.ts';

/**
 * Runs of tool calls, as rows (`@@D-1010`).
 *
 * The rule that matters is the boundary: two calls in a row are one row, a call after a message is
 * its own row again, and nothing is dropped or reordered — a transcript is a list of what happened,
 * and grouping that lost a call would be a page that lies about the work.
 */

const event = (
    seq: number,
    kind: ISessionEvent['kind'],
    payload: Record<string, unknown>,
): ISessionEvent => ({seq, kind, payload, at: 1_000 + seq * 100});

const call = (seq: number, name: string, id: string): ISessionEvent[] => [
    event(seq, 'tool', {toolName: name, toolCallId: id, args: {command: `run ${name}`}}),
    event(seq + 1, 'tool-result', {toolName: name, toolCallId: id, durationMs: 100}),
];

t.test('two calls in a row are one row, and a message splits the run', async t => {
    const sections = sessionSectionsOf([
        ...call(0, 'bash', 'a'),
        ...call(2, 'edit', 'b'),
        event(4, 'message', {text: 'done'}),
        ...call(5, 'bash', 'c'),
        ...call(7, 'edit', 'd'),
    ]);
    const rows = sessionRowsOf(sections);
    t.same(
        rows.map(row => row.kind),
        ['tools', 'section', 'tools'],
        'the first run, the answer and the second run',
    );
    t.equal((rows[0] as {calls: unknown[]}).calls.length, 2, 'the run holds both calls');
    t.equal((rows[2] as {calls: unknown[]}).calls.length, 2, 'and so does the one after the answer');
});

t.test('a lone call stays a card of its own', async t => {
    const rows = sessionRowsOf(sessionSectionsOf([...call(0, 'bash', 'a'), event(2, 'message', {text: 'x'})]));
    t.same(
        rows.map(row => row.kind),
        ['section', 'section'],
        'there is nothing to summarise, so nothing is grouped',
    );
});

t.test('the summary names each tool once, in the order it was first called', async t => {
    const sections = sessionSectionsOf([
        ...call(0, 'bash', 'a'),
        ...call(2, 'edit', 'b'),
        ...call(4, 'bash', 'c'),
    ]);
    const [row] = sessionRowsOf(sections);
    t.equal(
        (row as {title: string}).title,
        'Used 3 tools · bash ×2, edit',
        'counts the repeats and names the rest',
    );
});

t.test('the run is done when every call answered, and timed by its calls', async t => {
    const answered = sessionSectionsOf([...call(0, 'bash', 'a'), ...call(2, 'edit', 'b')]);
    const [row] = sessionRowsOf(answered);
    t.equal((row as {done: boolean}).done, true, 'two answered calls are a finished run');
    t.equal((row as {durationMs: number}).durationMs, 200, 'and it took the time its calls took');
});

t.test('a group of one never says "tools"', async t => {
    t.equal(toolRunSummary([{title: 'bash'} as never]), 'Used 1 tool · bash');
});

t.test('a call with no clock at all contributes nothing', async t => {
    // A section the page was handed without timestamps — a replay from a producer that did not write
    // them — must not make the run's time negative or `NaN`.
    const bare = (key: string, kind: 'tool' | 'message'): ICodeSection => ({
        key,
        kind,
        title: 'bash',
        text: '',
        open: false,
        done: true,
    });
    const [row] = sessionRowsOf([bare('a', 'tool'), bare('b', 'tool')]);
    t.equal((row as {durationMs: number}).durationMs, 0, 'zero, not NaN');
    // And an engine that named no tool still gets a summary rather than a gap in the sentence.
    t.equal(
        (row as {title: string}).title,
        'Used 2 tools · bash ×2',
        'the name it had is the name it is counted under',
    );
    t.equal(toolRunSummary([{title: undefined} as never]), 'Used 1 tool · tool', 'and an unnamed one is a tool');
});

t.test('a call that reported no duration is timed by its two events', async t => {
    // An engine that does not say how long a call took still wrote when it started and when it
    // answered, so the gap is what the row has to fall back to.
    const sections = sessionSectionsOf([
        event(0, 'tool', {toolName: 'bash', toolCallId: 'a'}),
        event(1, 'tool-result', {toolCallId: 'a'}),
        event(2, 'tool', {toolName: 'bash', toolCallId: 'b'}),
        event(3, 'tool-result', {toolCallId: 'b'}),
    ]);
    const [row] = sessionRowsOf(sections);
    t.equal((row as {durationMs: number}).durationMs, 200, 'one gap per call');
});

t.test('a run sums the durations the tools reported', async t => {
    // The two event stamps are only as accurate as the two writes — a batch inserted together makes
    // them equal — so a result that says how long the call took is what the row shows.
    const sections = sessionSectionsOf([
        event(0, 'tool', {toolName: 'bash', toolCallId: 'a'}),
        event(1, 'tool-result', {toolCallId: 'a', durationMs: 420}),
        event(2, 'tool', {toolName: 'edit', toolCallId: 'b'}),
        event(3, 'tool-result', {toolCallId: 'b', durationMs: 180}),
    ]);
    const [row] = sessionRowsOf(sections);
    t.equal((row as {durationMs: number}).durationMs, 600, 'the reported sum');
});

t.test('a tool is read as what it does, in either engine vocabulary', async t => {
    // A step engine names the realm's tools and a copilot runtime names its own, and a page that
    // drew both as JSON drew neither (`@@T-824`).
    t.equal(toolKindOf('bash'), 'shell', 'the runtime calls a shell bash');
    t.equal(toolKindOf('runCommand'), 'shell', 'the realm calls it runCommand');
    t.equal(toolKindOf('create'), 'write', 'a write is a create on the runtime');
    t.equal(toolKindOf('writeFile'), 'write', 'and writeFile in the realm');
    t.equal(toolKindOf('edit'), 'edit', 'an edit is an edit');
    t.equal(toolKindOf('view'), 'read', 'a read is a view');
    t.equal(toolKindOf('askHuman'), 'ask', 'and a question is askHuman');
    t.equal(toolKindOf('finish'), 'other', 'a tool nobody modelled stays other');
    t.equal(toolKindOf(undefined), 'other', 'and so does a call with no name');
    t.end();
});

t.test('a call is summarised by what it did, not by its JSON', async t => {
    const diff = [
        'diff --git a/notes.md b/notes.md',
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@ -1,2 +1,4 @@',
        ' first',
        '-old',
        '+new',
        '+third',
        '',
    ].join('\n');
    t.equal(
        toolStatsOf('bash', {exitCode: 0}),
        'exit 0',
        'a shell says whether it worked',
    );
    t.equal(
        toolStatsOf('edit', {diff}),
        '+2 −1',
        'an edit says how much it changed',
    );
    t.equal(
        toolStatsOf('create', {content: 'one\ntwo\n'}),
        '3 lines · 8 B',
        'a write with no diff to count says how big it is',
    );
    t.equal(
        toolStatsOf('view', {content: 'only one line'}),
        '1 line · 13 B',
        'a read says how long the file is',
    );
    t.equal(toolStatsOf('bash', undefined), '', 'and an unanswered call says nothing');
    t.equal(toolStatsOf('finish', {success: true}), '', 'a tool with nothing to size says nothing');
    t.equal(languageOfPath('/w/notes.md'), 'md', 'a file names its own grammar');
    t.equal(languageOfPath('/w/stats.py'), 'py', 'by its extension');
    t.equal(languageOfPath(undefined), 'text', 'and a call with no file asks for plain text');
    t.end();
});

t.test('a time is shown only when it is worth reading, and a slow one is marked', async t => {
    // A transcript is mostly quick calls, and a duration on every one of them is noise (`@@T-827`).
    t.equal(elapsedOf(0), '', 'nothing took no time worth printing');
    t.equal(elapsedOf(999), '', 'a sub-second call shows no time at all');
    t.equal(elapsedOf(1_000), '1.0s', 'a second is where the clock starts');
    t.equal(elapsedOf(15_004), '15.0s', 'and it is counted in seconds');
    t.equal(elapsedOf(59_400), '59.4s', 'up to the minute');
    t.equal(elapsedOf(120_417), '2m 0s', 'past it, in minutes and seconds');
    t.equal(elapsedOf(undefined), '', 'and an unstamped call says nothing');
    t.equal(isSlow(29_000), false, 'under thirty seconds is not slow');
    t.equal(isSlow(30_001), true, 'over it is');
    t.end();
});
