/**
 * Tests for the LogServer (REST + WebSocket).
 */

import {test} from 'tap';
import {LogServer} from './server.js';

test('LogServer', async t => {
    t.test('start and stop', async t => {
        const server = new LogServer({
            udpPort: 18999,
            httpPort: 18998,
            host: '127.0.0.1',
        });

        const {httpPort, udpPort} = await server.start();
        t.ok(httpPort);
        t.ok(udpPort);

        await server.stop();
    });

    t.test('REST API - get config', async t => {
        const server = new LogServer({
            udpPort: 18997,
            httpPort: 18996,
            host: '127.0.0.1',
            traceUrlPattern:
                'https://jaeger.example.com/trace/{traceId}?start={startTime}&end={endTime}',
        });

        await server.start();

        const res = await fetch('http://127.0.0.1:18996/api/config');
        t.equal(res.status, 200);

        const config = await res.json();
        t.ok(config.wsUrl);
        t.ok(config.apiUrl);
        t.ok(config.properties);
        t.equal(
            config.traceUrlPattern,
            'https://jaeger.example.com/trace/{traceId}?start={startTime}&end={endTime}',
        );

        await server.stop();
    });

    t.test('REST API - get entries (empty)', async t => {
        const server = new LogServer({
            udpPort: 18995,
            httpPort: 18994,
            host: '127.0.0.1',
        });

        await server.start();

        const res = await fetch('http://127.0.0.1:18994/api/entries');
        t.equal(res.status, 200);

        const data = await res.json();
        t.ok(Array.isArray(data.entries));
        t.equal(data.entries.length, 0);

        await server.stop();
    });

    t.test('REST API - add and get entries', async t => {
        const server = new LogServer({
            udpPort: 18993,
            httpPort: 18992,
            host: '127.0.0.1',
        });

        await server.start();

        // Add entries programmatically
        server.addEntry({level: 30, msg: 'hello world', name: 'test'});
        server.addEntry({level: 40, msg: 'warning message', name: 'test'});
        server.addEntry({level: 50, msg: 'error occurred', name: 'other'});

        // Get all entries
        const res = await fetch('http://127.0.0.1:18992/api/entries');
        const data = await res.json();
        t.equal(data.entries.length, 3);
        t.equal(data.total, 3);

        // Filter by level
        const warnRes = await fetch('http://127.0.0.1:18992/api/entries?level=warn');
        const warnData = await warnRes.json();
        t.equal(warnData.entries.length, 2);

        // Filter by name
        const nameRes = await fetch('http://127.0.0.1:18992/api/entries?name=test');
        const nameData = await nameRes.json();
        t.equal(nameData.entries.length, 2);

        // Search
        const searchRes = await fetch('http://127.0.0.1:18992/api/search?search=error');
        const searchData = await searchRes.json();
        t.equal(searchData.entries.length, 1);
        t.equal(searchData.entries[0].msg, 'error occurred');

        await server.stop();
    });

    t.test('REST API - filter with limit', async t => {
        const server = new LogServer({
            udpPort: 18991,
            httpPort: 18990,
            host: '127.0.0.1',
        });

        await server.start();

        for (let i = 0; i < 10; i++) {
            server.addEntry({level: 30, msg: `entry-${i}`});
        }

        const res = await fetch('http://127.0.0.1:18990/api/entries?limit=3');
        const data = await res.json();
        t.equal(data.entries.length, 3);
        t.equal(data.entries[0].msg, 'entry-7');

        await server.stop();
    });

    t.test('REST API - POST /api/query', async t => {
        const server = new LogServer({
            udpPort: 18971,
            httpPort: 18970,
            host: '127.0.0.1',
        });

        await server.start();

        server.addEntry({level: 30, msg: 'info one', name: 'svc-a'});
        server.addEntry({level: 40, msg: 'warn one', name: 'svc-a'});
        server.addEntry({level: 50, msg: 'error one', name: 'svc-b'});

        // Query without filters returns all entries
        const allRes = await fetch('http://127.0.0.1:18970/api/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: '{}',
        });
        t.equal(allRes.status, 200);
        const allData = await allRes.json();
        t.equal(allData.entries.length, 3);

        // Query with level filter
        const errRes = await fetch('http://127.0.0.1:18970/api/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({level: 'error'}),
        });
        const errData = await errRes.json();
        t.equal(errData.entries.length, 1);
        t.equal(errData.entries[0].msg, 'error one');

        // Query with name filter
        const nameRes = await fetch('http://127.0.0.1:18970/api/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: 'svc-a'}),
        });
        const nameData = await nameRes.json();
        t.equal(nameData.entries.length, 2);

        // Empty body is treated as no filters
        const emptyRes = await fetch('http://127.0.0.1:18970/api/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: '',
        });
        t.equal(emptyRes.status, 200);
        const emptyData = await emptyRes.json();
        t.equal(emptyData.entries.length, 3);

        // Invalid JSON returns 400
        const badRes = await fetch('http://127.0.0.1:18970/api/query', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: 'not-json',
        });
        t.equal(badRes.status, 400);
        const badData = await badRes.json();
        t.equal(badData.error, 'Invalid JSON in request body');

        await server.stop();
    });

    t.test('REST API - CORS headers', async t => {
        const server = new LogServer({
            udpPort: 18989,
            httpPort: 18988,
            host: '127.0.0.1',
        });

        await server.start();

        const res = await fetch('http://127.0.0.1:18988/api/config');
        t.equal(res.headers.get('access-control-allow-origin'), '*');

        await server.stop();
    });

    t.test('WebSocket - connect and receive config', async t => {
        const server = new LogServer({
            udpPort: 18987,
            httpPort: 18986,
            host: '127.0.0.1',
        });

        await server.start();

        const {WebSocket} = await import('ws');
        const ws = new WebSocket('ws://127.0.0.1:18986/ws');

        const msg = await new Promise<string>(resolve => {
            ws.on('message', (data: Buffer) => {
                resolve(data.toString());
            });
        });

        const parsed = JSON.parse(msg);
        t.equal(parsed.type, 'config');
        t.ok(parsed.config.wsUrl);

        ws.close();
        await server.stop();
    });

    t.test('WebSocket - subscribe and receive entries', async t => {
        const server = new LogServer({
            udpPort: 18985,
            httpPort: 18984,
            host: '127.0.0.1',
        });

        await server.start();

        // Add some entries before connecting
        server.addEntry({level: 30, msg: 'existing'});

        const {WebSocket} = await import('ws');
        const ws = new WebSocket('ws://127.0.0.1:18984/ws');

        // Wait for config message
        await new Promise<void>(resolve => {
            ws.on('message', () => resolve());
        });

        // Subscribe
        ws.send(JSON.stringify({type: 'subscribe', filters: {}}));

        // Receive initial entries
        const entriesMsg = await new Promise<string>(resolve => {
            ws.on('message', (data: Buffer) => {
                resolve(data.toString());
            });
        });

        const parsed = JSON.parse(entriesMsg);
        t.equal(parsed.type, 'entries');
        t.equal(parsed.entries.length, 1);

        // Now add a new entry and receive it in real-time
        const realtimePromise = new Promise<string>(resolve => {
            ws.on('message', (data: Buffer) => {
                resolve(data.toString());
            });
        });

        server.addEntry({level: 40, msg: 'real-time entry'});

        const realtimeMsg = await realtimePromise;
        const realtimeParsed = JSON.parse(realtimeMsg);
        t.equal(realtimeParsed.type, 'entry');
        t.equal(realtimeParsed.entry.msg, 'real-time entry');

        ws.close();
        await server.stop();
    });

    t.test('WebSocket - filtered subscription', async t => {
        const server = new LogServer({
            udpPort: 18983,
            httpPort: 18982,
            host: '127.0.0.1',
        });

        await server.start();

        const {WebSocket} = await import('ws');
        const ws = new WebSocket('ws://127.0.0.1:18982/ws');

        // Wait for config
        await new Promise<void>(resolve => {
            ws.on('message', () => resolve());
        });

        // Subscribe with error level filter
        ws.send(JSON.stringify({type: 'subscribe', filters: {level: 'error'}}));

        // Wait for initial entries response
        await new Promise<void>(resolve => {
            ws.on('message', () => resolve());
        });

        // Track received messages
        const received: unknown[] = [];
        ws.on('message', (data: Buffer) => {
            received.push(JSON.parse(data.toString()));
        });

        // Add entries of different levels
        server.addEntry({level: 30, msg: 'info - should not arrive'});
        server.addEntry({level: 50, msg: 'error - should arrive'});

        await new Promise(r => setTimeout(r, 200));

        // Only the error entry should be received
        t.equal(received.length, 1);
        t.same((received[0] as {entry: {msg: string}}).entry.msg, 'error - should arrive');

        ws.close();
        await server.stop();
    });

    t.test('client config generation', async t => {
        const server = new LogServer({
            udpPort: 18981,
            httpPort: 18980,
            host: '127.0.0.1',
            recentCount: 500,
            traceUrlPattern: 'https://traces.example.com/{traceId}',
        });

        const config = server.getClientConfig();
        t.equal(config.recentCount, 500);
        t.equal(config.traceUrlPattern, 'https://traces.example.com/{traceId}');
        t.ok(config.theme);
        t.ok(config.properties);
    });

    t.test('snapshot - GET /api/config', async t => {
        const server = new LogServer({
            udpPort: 18979,
            httpPort: 18978,
            host: '127.0.0.1',
            traceUrlPattern: 'https://trace.example.com/{traceId}',
        });

        await server.start();

        const res = await fetch('http://127.0.0.1:18978/api/config');
        const config = await res.json();

        // Normalize dynamic URLs for snapshot
        config.wsUrl = config.wsUrl.replace(/127\.0\.0\.1:\d+/, '127.0.0.1:PORT');
        config.apiUrl = config.apiUrl.replace(/127\.0\.0\.1:\d+/, '127.0.0.1:PORT');

        t.matchSnapshot(config, 'GET /api/config response');

        await server.stop();
    });

    t.test('snapshot - GET /api/entries with data', async t => {
        const server = new LogServer({
            udpPort: 18977,
            httpPort: 18976,
            host: '127.0.0.1',
        });

        await server.start();

        // Add deterministic test data
        server.addEntry({
            level: 30,
            msg: 'info message',
            name: 'test-service',
            time: 1700000000000,
        });
        server.addEntry({
            level: 50,
            msg: 'error occurred',
            name: 'test-service',
            time: 1700000001000,
            err: {type: 'Error', message: 'something went wrong'},
        });

        const res = await fetch('http://127.0.0.1:18976/api/entries');
        const data = await res.json();

        // Remove dynamic IDs for snapshot
        data.entries = data.entries.map((e: {id: string}) => ({...e, id: 'ULID'}));

        t.matchSnapshot(data, 'GET /api/entries response shape');

        await server.stop();
    });

    t.test('snapshot - GET /api/search with results', async t => {
        const server = new LogServer({
            udpPort: 18975,
            httpPort: 18974,
            host: '127.0.0.1',
        });

        await server.start();

        // Add test data
        server.addEntry({level: 30, msg: 'user login', name: 'auth', time: 1700000000000});
        server.addEntry({level: 30, msg: 'user logout', name: 'auth', time: 1700000001000});
        server.addEntry({level: 30, msg: 'data fetch', name: 'api', time: 1700000002000});

        const res = await fetch('http://127.0.0.1:18974/api/search?search=user');
        const data = await res.json();

        // Remove dynamic IDs for snapshot
        data.entries = data.entries.map((e: {id: string}) => ({...e, id: 'ULID'}));

        t.matchSnapshot(data, 'GET /api/search filtered results');

        await server.stop();
    });
});
