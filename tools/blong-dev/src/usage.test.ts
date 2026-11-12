/**
 * Unit tests for the shared `blong-dev` help (usage.ts and the help registry).
 *
 * The `cli.ts` entry itself is not imported (it dispatches commands and exits the
 * process); the pure renderers and the resolver are tested here, at each of the three
 * levels the CLI answers.
 */

import {test} from 'tap';

import {
    COMMANDS,
    USAGE_LINES,
    findCommand,
    findVerb,
    helpText,
    renderCommand,
    renderIndex,
    renderVerb,
    resolveHelp,
    usageHint,
    writeUnknownCommand,
    writeUsage,
} from './usage.ts';

/** A stream that only collects what is written to it. */
function collector(): {stream: NodeJS.WriteStream; text: () => string} {
    let out = '';
    const stream = {
        write: (s: string) => {
            out += s;
            return true;
        },
    } as unknown as NodeJS.WriteStream;
    return {stream, text: () => out};
}

test('USAGE_LINES lists every subcommand including sql', async t => {
    for (const sub of [
        'lint',
        'test',
        'playwright',
        'browsers',
        'proxy',
        'trace',
        'log',
        'sql',
        'db',
        'cspell',
        'glossary',
        'publish',
        'report',
        'ci-report',
        'ci',
        'call',
        'user',
        'memory',
        'plan',
        'docs',
    ]) {
        t.ok(
            USAGE_LINES.some(line => line.includes(`blong-dev ${sub}`)),
            `lists blong-dev ${sub}`,
        );
    }
    t.end();
});

test('level 1 lists every command with its summary', async t => {
    const text = renderIndex();
    for (const command of COMMANDS) {
        t.ok(text.includes(`blong-dev ${command.name}`), `names ${command.name}`);
        t.ok(text.includes(command.summary), `summarises ${command.name}`);
    }
    t.match(text, /blong-dev <command> --help/, 'promotes the command-level help');
    t.match(text, /blong-dev <command> <verb> --help/, 'promotes the verb-level help');
    t.end();
});

test('level 2 lists the verbs of a command that has them', async t => {
    const memory = findCommand('memory');
    t.ok(memory, 'the registry knows memory');
    const text = renderCommand(memory!);
    t.match(text, /^blong-dev memory — /m, 'names the command');
    t.match(text, /^  close +Give an entry its terminal status$/m, 'lists a verb');
    t.match(text, /blong-dev memory <verb> --help/, 'promotes the verb-level help');
    t.end();
});

test('level 3 shows a verb usage, options and examples', async t => {
    const command = findCommand('ci');
    const verb = findVerb(command, 'failures');
    t.ok(verb, 'the registry knows ci failures');
    const text = renderVerb(command!, verb!);
    t.match(text, /^blong-dev ci failures — /m, 'names the verb');
    t.match(text, /blong-dev ci failures \[--pr/, 'shows the usage line');
    t.match(text, /--full +read the reasons/, 'lists an option');
    t.match(text, /Examples:/, 'shows examples');
    t.end();
});

test('helpText falls back to the level above for an unknown name', async t => {
    t.match(helpText('nope'), /no command "nope"/, 'an unknown command says so');
    t.match(helpText('cspell', 'nope'), /no verb "nope"/, 'an unknown verb says so');
    t.match(helpText('cspell', 'nope'), /blong-dev cspell — /, 'and shows the command');
    t.end();
});

test('resolveHelp answers each of the three levels', async t => {
    t.same(resolveHelp('--help', []), {}, 'no command asks for the list');
    t.same(resolveHelp(undefined, []), {}, 'a bare invocation asks for the list');
    t.same(resolveHelp('cspell', ['--help']), {command: 'cspell'}, 'a command asks for its verbs');
    t.same(
        resolveHelp('cspell', ['add', '--help']),
        {command: 'cspell', verb: 'add'},
        'a command and a verb ask for that verb',
    );
    t.same(
        resolveHelp('help', ['memory', 'close']),
        {command: 'memory', verb: 'close'},
        'help <cmd> <verb>',
    );
    t.equal(resolveHelp('cspell', ['add', 'kukum']), undefined, 'a real call asks for no help');
    t.same(
        resolveHelp('memory', []),
        {command: 'memory'},
        'a bare verb-taking command shows its verbs',
    );
    t.equal(resolveHelp('ci', []), undefined, 'a command with a default verb stays runnable');
    t.equal(resolveHelp('publish', []), undefined, 'so does publish');
    t.end();
});

test('usageHint names the verb that was being called', async t => {
    t.equal(usageHint('sql'), 'Run `blong-dev sql --help` to see its parameters.');
    t.match(usageHint('memory', 'add'), /blong-dev memory add --help/, 'names the verb');
    t.end();
});

test('writeUsage writes the command list', async t => {
    const {stream, text} = collector();
    writeUsage(stream);
    t.match(text(), /^blong-dev — /, 'title first');
    t.match(text(), /blong-dev sql/, 'includes sql');
    t.end();
});

test('writeUnknownCommand prefixes the error before the list', async t => {
    const {stream, text} = collector();
    writeUnknownCommand(stream, 'nope');
    t.match(text(), /^blong-dev: Unknown command "nope"\n/, 'error first');
    t.match(text(), /Commands:/, 'the list follows');
    t.end();
});
