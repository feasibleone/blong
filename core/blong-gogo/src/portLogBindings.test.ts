/**
 * What a port's records say about the port (`@@F-800`).
 *
 * Every record a port writes is bound once, when it initialises, and that binding is the only place
 * a reader learns *which* adapter or orchestrator spoke. It has to be the id — `<realm>.<layer>` —
 * because that is the word the capture policy already uses for an instance, the terminal prints and
 * the viewer shows; the kind is what tells two ports of one layer apart, and a realm has several.
 *
 * The regression this pins is quiet: the binding carried the id as `name` and the kind as `context`,
 * and lukaot reads `name` only as a *fallback* for `context`, so the kind shadowed the id and no
 * surface ever named the port. Nothing failed — the records were just anonymous.
 */

import {test} from 'tap';

import {AdapterBase} from './AdapterBase.ts';
import LukaotLog from './LukaotLog.ts';

/** A log that keeps its records, so a binding can be read off one. */
function harness() {
    const lines: string[] = [];
    const log = new LukaotLog({
        format: 'json',
        level: 'trace',
        writer: {
            write: (line: string) => {
                lines.push(line);
            },
        },
        cache: {
            put: async () => undefined,
            putSync: () => undefined,
            get: async () => undefined,
        } as never,
    });
    const records = (): Array<Record<string, unknown>> =>
        lines
            .join('')
            .split('\n')
            .filter(line => line.trim().startsWith('{'))
            .map(line => JSON.parse(line) as Record<string, unknown>);
    return {log, records};
}

/** The api slice `init` reaches, and nothing else. */
const apiWith = (log: LukaotLog) => ({
    register: () => undefined,
    subscribe: () => undefined,
    dispatch: () => undefined,
    methodId: (method: string) => method,
    getPath: (method: string) => method,
    attachHandlers: async () => undefined,
    attachCheckpoint: () => undefined,
    captureFor: () => undefined,
    createLog: (level: 'info', bindings: object) => log.logger(level, bindings),
    render: (configs: object[]) => Object.assign({}, ...configs),
    platform: {},
    registry: {objectSchema: {}},
    attach: async () => undefined,
});

test('a port records its id as the component and its kind beside it', async t => {
    const {log, records} = harness();
    const base = new AdapterBase(apiWith(log) as never, 'demo.adapter') as unknown as AdapterBase<
        unknown,
        never
    >;
    await base.init({id: 'demo.adapter', type: 'knex', pkg: {version: '1.0.0'}});
    await base.event('start', {});

    const started = records().find(record => record.operation === 'adapter.start');
    t.ok(started, 'the port wrote a record when it started');
    const fields = (started?.fields ?? {}) as Record<string, unknown>;
    t.equal(
        fields.context,
        'demo.adapter',
        'the component is the port id, which is what a reader filters and enables by',
    );
    t.equal(fields.portType, 'knex', 'and the kind rides beside it, so two ports differ');
    t.end();
});

test('a port with no kind still says whose record it is', async t => {
    const {log, records} = harness();
    const base = new AdapterBase(
        apiWith(log) as never,
        'demo.orchestrator',
    ) as unknown as AdapterBase<unknown, never>;
    await base.init({id: 'demo.orchestrator', pkg: {version: '1.0.0'}});
    await base.event('start', {});

    const fields = (records().find(record => record.operation === 'adapter.start')?.fields ??
        {}) as Record<string, unknown>;
    t.equal(fields.context, 'demo.orchestrator', 'the id is still the component');
    t.equal(fields.portType, 'dispatch', 'and the missing kind falls back to the old default');
    t.end();
});
