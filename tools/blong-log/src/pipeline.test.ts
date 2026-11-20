/**
 * The producer seam: a lukaot process, over UDP, into the viewer's server.
 *
 * The writer is lukaot's (`@feasibleone/lukaot/node`), and this test is the one that proves the two
 * halves agree: the sink that ships records and the server that draws them share the batch wire format
 * by importing it from the same place, so a change to one cannot leave the other unreadable
 * (`@@D-930`). A real `LukaotLog`-style logger installs the writer with `setWriter`, emits a declared
 * signal and two captures, and the server answers `/api/entries` with the records — with the fields the
 * viewer reads to draw them.
 */

import {setWriter} from '@feasibleone/lukaot';
import {createLogger, createUdpWriter} from '@feasibleone/lukaot/node';
import {test} from 'tap';

import {LogServer} from './server.ts';

test('a lukaot process feeds the server with the records the viewer draws', async t => {
    const server = new LogServer({udpPort: 19199, httpPort: 19198, host: '127.0.0.1'});
    await server.start();
    const writer = createUdpWriter({port: 19199, batchSize: 50});
    setWriter(writer);
    t.teardown(async () => {
        setWriter(null);
        writer.close();
        await server.stop();
    });

    // A lukaot logger, writing through the process writer exactly as a framework process does. The
    // record it hands the destination is the structured one — the line is a rendering for a terminal,
    // and a viewer that had only the line could draw the sentence but none of the fields.
    const log = createLogger({level: 'trace', service: 'blong-probe'});
    log.info('generating dir /tmp/x', {
        context: 'ApiSchema',
        signal: 'frameworkSchemaDirScanning',
        params: {dir: '/tmp/x'},
    });
    log.info('tcp frame', {
        context: 'srv.tcp',
        capture: 'frameworkTcpFrame',
        shape: 'tcp.frame',
        rung: 'full',
        bytes: 6,
        direction: 'out',
        payload: 'ff d8 30 32 30 30',
    });
    log.info('json payload', {
        context: 'srv.http',
        capture: 'frameworkJsonPayload',
        shape: 'json',
        rung: 'body',
        bytes: 20,
        label: 'mle.result',
        payload: '{"state":"COMMITTED"}',
    });
    writer.flush();
    // UDP is not acknowledged; the batch is in the socket's queue, so the read waits for it to land.
    await new Promise(resolve => setTimeout(resolve, 400));

    const response = await fetch('http://127.0.0.1:19198/api/entries?limit=20');
    const body = (await response.json()) as {entries: Array<Record<string, unknown>>};
    t.equal(body.entries.length, 3, 'three records crossed the wire');

    const signal = body.entries.find(entry => entry['signal'] === 'frameworkSchemaDirScanning');
    t.ok(signal, 'a declared signal keeps its identifier at the top level');
    t.same(
        (signal?.['fields'] as Record<string, unknown>)?.['params'],
        {dir: '/tmp/x'},
        'and the values it was called with',
    );

    const frame = body.entries.find(
        entry => (entry['fields'] as Record<string, unknown>)?.['shape'] === 'tcp.frame',
    );
    t.equal(
        (frame?.['fields'] as Record<string, unknown>)?.['rung'],
        'full',
        'the frame was kept at the rung the configuration asked for',
    );
    t.equal(
        (frame?.['fields'] as Record<string, unknown>)?.['payload'],
        'ff d8 30 32 30 30',
        'with its bytes, which is what the hex column draws',
    );

    const filtered = await fetch('http://127.0.0.1:19198/api/entries?capture=json');
    const onlyJson = (await filtered.json()) as {entries: Array<Record<string, unknown>>};
    t.equal(onlyJson.entries.length, 1, 'and the capture filter answers one shape');
});
