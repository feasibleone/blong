/**
 * A destination named by configuration.
 *
 * The point of this seam is that the common case names an address and nothing else — the sink ships in
 * `@feasibleone/lukaot/node` — while a custom destination is a module the loader imports and hands its
 * options to. The cases pinned here are the readings that decide which of the two a block means, and
 * the three that decide whether a misconfiguration is survivable: a module that loads, one that cannot
 * be found, and one whose factory answers something that is not a writer (`@@D-930`).
 */

import {getWriter, setWriter} from '@feasibleone/lukaot';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'tap';

import {destinationSpecifier, installDestination, resolveDestination} from './destination.ts';

/** The warnings an install reported, as the log would have written them. */
function reporter(): {warn: (message: string, reason: string) => void; said: string[]} {
    const said: string[] = [];
    return {
        said,
        warn: (message, reason) => said.push(`${message} — ${reason}`),
    };
}

test('an address names the shipped sink, a name names a module', async t => {
    t.same(
        resolveDestination('udp://collector:9999'),
        {kind: 'udp', options: {host: 'collector', port: 9999}},
        'an address builds the sink, so no package has to be installed beside the process',
    );
    t.same(
        resolveDestination({host: 'collector', port: 9999}),
        {kind: 'udp', options: {host: 'collector', port: 9999}},
        'a block that names no module is the sink options',
    );
    t.same(
        resolveDestination(true),
        {kind: 'udp', options: {}},
        'and `true` is the sink with its defaults',
    );
    t.same(
        resolveDestination('../../tools/my-writer.ts'),
        {kind: 'module', module: '../../tools/my-writer.ts', options: {}},
        'a string that is not an address names a module',
    );
    t.same(
        resolveDestination({module: 'some/writer', options: {port: 9999}}),
        {kind: 'module', module: 'some/writer', options: {port: 9999}},
        'and so does a block with a module, carrying the options',
    );
    t.equal(resolveDestination(undefined), undefined, 'no block, no destination');
    t.same(resolveDestination({}), {kind: 'udp', options: {}}, 'an empty block is the defaults');
    t.equal(resolveDestination(42), undefined, 'and a number names nothing');
    t.equal(resolveDestination({module: ''}), undefined, 'as does an empty module name');
    t.end();
});

test('the address form installs the sink and closes it', async t => {
    const reported = reporter();
    // Port 9 is the discard service: the batch is sent and nobody reads it, which is the writer's own
    // business — what is pinned is that the block built a writer and installed it.
    const installed = await installDestination({port: 9, batchSize: 1000}, reported.warn);
    t.teardown(() => setWriter(null));

    t.ok(installed, 'the sink was built and installed');
    t.same(reported.said, [], 'and nothing was reported');
    t.ok(getWriter(), 'and the process has somewhere to write');
    t.doesNotThrow(() => installed?.close(), 'and it can be closed with the process');
    t.end();
});

test('a module that answers a writer becomes the process destination', async t => {
    const reported = reporter();
    // A module of this test's own, which is what a realm or a suite would write: a default export
    // taking the options and answering an object with `write`.
    // The writer the process already had is a recording one, not stdout: a destination is now *added*
    // to it, so writing through the process would otherwise print into the test runner's own output.
    const kept: string[] = [];
    setWriter({write: line => kept.push(line)});
    const installed = await installDestination(
        {module: new URL('./destination.fixture.ts', import.meta.url).href, options: {tag: 'x'}},
        reported.warn,
    );
    t.teardown(() => setWriter(null));

    t.ok(installed, 'the module was imported and its factory called');
    t.same(reported.said, [], 'and nothing was reported');
    getWriter()?.write('a line', undefined);
    installed?.writer.write('another line', undefined);
    t.same(kept, ['a line'], 'the process keeps writing where it wrote before');
    t.same(
        (installed?.writer as unknown as {lines?: string[]})?.lines,
        ['a line', 'another line'],
        'and the destination receives what is written through either',
    );
    installed?.close();
    t.same(
        (installed?.writer as unknown as {ended?: string[]})?.ended,
        ['close', 'flush'],
        'and closing it ends the destination and then flushes what it still holds',
    );
    t.end();
});

test('a module that cannot be imported is reported, and the records stay put', async t => {
    const reported = reporter();
    const installed = await installDestination({module: 'no-such-module-anywhere'}, reported.warn);
    t.equal(installed, undefined, 'nothing is installed');
    t.equal(reported.said.length, 1, 'and the reason is said once');
    t.match(reported.said[0], /could not be imported/, 'naming what failed');
    t.end();
});

test('a module whose factory answers no writer is reported', async t => {
    const reported = reporter();
    const installed = await installDestination(
        {module: new URL('./destination.impostor.fixture.ts', import.meta.url).href},
        reported.warn,
    );
    t.equal(installed, undefined);
    t.match(reported.said[0], /answered no writer/);
    t.end();
});

test('a module whose factory throws is reported, and the records stay put', async t => {
    const reported = reporter();
    const installed = await installDestination(
        {module: new URL('./destination.thrower.fixture.ts', import.meta.url).href},
        reported.warn,
    );
    t.equal(installed, undefined, 'nothing is installed');
    t.match(reported.said[0], /threw while starting/);
    t.end();
});

test('a destination is added to what the process already writes', async t => {
    // A destination is where a record *also* goes. Installing one as the only writer silenced the
    // process: a configured run stopped printing the lines its own terminal was being read for, and a
    // spawn test waiting on one of them hung for its full two minutes (`@@D-930`).
    const reported = reporter();
    const kept: string[] = [];
    setWriter({write: line => kept.push(line)});
    const installed = await installDestination(
        {module: new URL('./destination.fixture.ts', import.meta.url).href},
        reported.warn,
    );
    t.teardown(() => setWriter(null));

    t.ok(installed, 'the module loaded');
    getWriter()?.write('a line', undefined);
    t.same(kept, ['a line'], 'what the process wrote before still reaches its own destination');
    t.same(
        (installed?.writer as unknown as {lines?: string[]})?.lines,
        ['a line'],
        'and the new destination receives it as well',
    );
    installed?.close();
    t.end();
});

test('a name is resolved from the working directory, not from this file', async t => {
    // `core/blong-gogo` does not depend on the package a configuration names, so `import('…')` from
    // this file would never find it. The base is the directory the configuration was read from.
    t.equal(
        destinationSpecifier('file:///tmp/writer.ts'),
        'file:///tmp/writer.ts',
        'a URL is taken as written',
    );
    t.equal(
        destinationSpecifier('/tmp/writer.ts'),
        pathToFileURL('/tmp/writer.ts').href,
        'an absolute path is a path',
    );
    t.equal(
        destinationSpecifier('./tools/blong-log/src/writer.ts', '/repo'),
        pathToFileURL(path.resolve('/repo', './tools/blong-log/src/writer.ts')).href,
        'a relative path is relative to the base',
    );
    t.match(
        destinationSpecifier('tap', path.dirname(new URL(import.meta.url).pathname)),
        /^file:\/\/.*tap/,
        'a name the base can resolve becomes the file it resolved to',
    );
    t.equal(
        destinationSpecifier('no-such-module-anywhere'),
        'no-such-module-anywhere',
        'and a name that resolves nowhere is left for the import to report',
    );
    t.end();
});
