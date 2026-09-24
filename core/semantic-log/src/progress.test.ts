/**
 * Progress points (PRD R26/R27): a checkpoint is a point, a decision a region.
 *
 * The point list and the branch a record was emitted inside are one contract, so
 * they are one test file: what a record carries, how it is drawn, and which part
 * of it shapes the identity.
 */

import t from 'tap';
import {
    attachProgress,
    currentRegion,
    point,
    takePoints,
    takeProgress,
    withIntent,
    withRegion,
} from './context.ts';
import {decide} from './decide.ts';
import {serializeForIdentity} from './fingerprint.ts';
import {createLogger} from './logger.ts';
import type {LogRecord, Progress} from './record.ts';
import {renderHuman} from './render.ts';
import type {Writer} from './writer.ts';

const base: LogRecord = {
    id: '01J8Z9K2M9PQRSTVWXYZ0A1B2C',
    time: 1757765472345,
    level: 30,
    levelName: 'info',
    msg: 'quote handled',
    service: 'hub',
    refs: {record: '01J8Z9K2M9PQRSTVWXYZ0A1B2C'},
};

function capture(): {lines: string[]; writer: Writer} {
    const lines: string[] = [];
    return {lines, writer: {write: (line: string) => void lines.push(line)}};
}

/** The record a JSON-mode line carries. */
function record(line: string): LogRecord {
    return JSON.parse(line) as LogRecord;
}

t.test('a branch taken in a scope is reported by the call that took it', t => {
    // The receiver's half of the contract (PRD R27). A branch's own scope is closed by the time
    // the handler that took it returns, so the chain cannot carry it to the answer — a *visited*
    // list can, and that is what makes a branch inside a handler reachable by a diagram at all:
    // the records inside the branch are the handler's own, and the framework does not write them.
    const returned = withRegion(
        {discriminator: 'role-bit', candidates: ['declared', 'allocated'], chosen: 'allocated'},
        () => 'done',
    );
    t.equal(returned, 'done', 'the branch ran and returned what it returned');
    t.same(
        takeProgress()?.regions?.map(region => [region.discriminator, region.chosen]),
        [['role-bit', 'allocated']],
        'and the branch it took is reported to whoever answers for the scope',
    );
    t.equal(takeProgress(), undefined, 'taken once, so a second answer does not repeat it');
    t.end();
});

t.test('taking the progress consumes the points it reports', t => {
    point('merge-started', {bundles: 1});
    t.same(
        takeProgress()?.points,
        [{name: 'merge-started', data: {bundles: 1}}],
        'the point is reported, with its data still local',
    );
    t.equal(takePoints(), undefined, 'and consumed, so no later record repeats it');
    t.end();
});

t.test('progress a caller already holds is announced on the next record', t => {
    // `attachProgress` is what the framework around a handler does with what it collected:
    // re-announce it, so the record the call answers with carries it like any other progress.
    const {lines, writer} = capture();
    const logger = createLogger({service: 'gateway', writer, format: 'json'});
    attachProgress({
        regions: [
            {
                id: '1',
                discriminator: 'role-bit',
                candidates: ['declared', 'allocated'],
                chosen: 'allocated',
            },
        ],
        points: [{name: 'merge-started', data: {bundles: 1}}],
    });
    logger.info('merge answered');
    const carried = record(lines[0]);
    t.same(
        carried.progress?.points,
        [{name: 'merge-started', data: {bundles: 1}}],
        'the point rides the record',
    );
    t.same(
        carried.progress?.regions?.map(region => [region.discriminator, region.chosen]),
        [['role-bit', 'allocated']],
        'and so does the branch, which is what lets the answer draw its block',
    );
    t.end();
});

t.test('a point waits for the next record and is taken once', t => {
    t.equal(takePoints(), undefined, 'nothing is pending in a fresh scope');
    point('total-calculated', {total: 200});
    point('order-created');
    t.same(
        takePoints(),
        [{name: 'total-calculated', data: {total: 200}}, {name: 'order-created'}],
        'both points, in the order announced, and one with no data carries none',
    );
    t.equal(takePoints(), undefined, 'taken once, not broadcast');
    t.end();
});

t.test('the points reach the record, with their data retained locally', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json'});
    point('total-calculated', {total: 200});
    logger.info('order created');
    const written = record(lines[0]);
    t.same(written.progress?.points, [{name: 'total-calculated', data: {total: 200}}]);
    t.equal(written.progress?.regions, undefined, 'no branch, so no region chain');
    t.end();
});

t.test('a point announced inside a branch rides the same record as the branch', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'fxp', writer, format: 'json'});
    decide('rate-within-limit', {rate: 1.3, rateLimit: 1.15}, [
        {
            name: 'decline',
            when: () => true,
            run: () => {
                point('rate-declined', {rate: 1.3});
                logger.warn('rate declined');
            },
        },
        {name: 'accept', when: () => true, run: () => logger.info('rate accepted')},
    ]);
    const written = record(lines[0]);
    const [branch] = written.progress?.regions ?? [];
    t.equal(branch?.discriminator, 'rate-within-limit', 'the branch is reported');
    t.equal(branch?.chosen, 'decline');
    t.same(
        branch?.candidates,
        ['decline', 'accept'],
        'every declared candidate, in evaluation order — the drawing marks the unreached ones',
    );
    t.match(String(branch?.id), /^\d+$/, 'the region carries a minted position');
    t.same(written.progress?.points, [{name: 'rate-declined', data: {rate: 1.3}}]);
    t.end();
});

t.test('a record with no progress point carries no progress slot at all', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json'});
    logger.info('plain');
    t.notOk(
        'progress' in record(lines[0]),
        'absent stays absent, so no redaction pattern can collapse an empty slot',
    );
    t.end();
});

t.test('a filtered record does not consume a point it never carried', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json', level: 'warn'});
    point('early');
    logger.debug('filtered away');
    t.equal(lines.length, 0, 'the threshold suppressed the record');
    logger.warn('written');
    t.same(
        record(lines[0]).progress?.points,
        [{name: 'early'}],
        'the point rides the next record actually emitted',
    );
    t.end();
});

t.test('a point announced outside a nested scope is consumed inside it', async t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'hub', writer, format: 'json'});
    point('outer');
    await withIntent({name: 'Inner'}, async () => {
        logger.info('inside');
    });
    logger.info('outside');
    t.same(record(lines[0]).progress?.points, [{name: 'outer'}], 'the nested record carries it');
    t.notOk('progress' in record(lines[1]), 'the enclosing record does not repeat it');
    t.end();
});

t.test('a region is visible inside the branch and gone after it', t => {
    let inside: {id?: string; chosen?: string} = {};
    withRegion(
        {discriminator: 'rate-within-limit', candidates: ['decline', 'accept'], chosen: 'decline'},
        () => {
            inside = currentRegion() ?? {};
        },
    );
    t.equal(inside.chosen, 'decline');
    t.match(String(inside.id), /^\d+$/, 'the first branch of a scope carries a position');
    t.equal(
        currentRegion(),
        undefined,
        'scoped, not persisted: after the branch there is no region',
    );
    t.end();
});

t.test('sibling branches number in order and a nested branch nests in its parent', t => {
    const ids: string[] = [];
    const read = () => ids.push(currentRegion()?.id ?? '');
    withRegion({discriminator: 'first', candidates: ['a'], chosen: 'a'}, read);
    withRegion({discriminator: 'second', candidates: ['a'], chosen: 'a'}, read);
    let outer = '';
    let nested = '';
    withRegion({discriminator: 'outer', candidates: ['a'], chosen: 'a'}, () => {
        outer = currentRegion()?.id ?? '';
        withRegion({discriminator: 'inner', candidates: ['a'], chosen: 'a'}, () => {
            nested = currentRegion()?.id ?? '';
        });
    });
    const [first, second] = ids;
    t.equal(Number(second), Number(first) + 1, 'siblings number in order');
    t.equal(nested, `${outer}.1`, 'a branch inside a branch nests in its parent path');
    t.end();
});

t.test('a record emitted inside the chosen branch carries it; one after does not', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'fxp', writer, format: 'json'});
    decide('rate-within-limit', {rate: 1.3}, [
        {name: 'decline', when: () => true, run: () => logger.warn('rate declined')},
        {name: 'accept', when: () => true, run: () => logger.info('rate accepted')},
    ]);
    logger.info('after the branch');
    t.equal(
        record(lines[0]).progress?.regions?.[0]?.chosen,
        'decline',
        'the branch is on its own record',
    );
    t.equal(
        record(lines[0]).decision?.chosen,
        'decline',
        'and the one-shot rationale landed on the same record',
    );
    t.notOk(
        'progress' in record(lines[1]),
        'reporting a rationale is not being inside a branch (R26)',
    );
    t.end();
});

t.test('a branch inside a branch reports the inner one, nested below it', t => {
    const {lines, writer} = capture();
    const logger = createLogger({service: 'fxp', writer, format: 'json'});
    decide('outer', {}, [
        {
            name: 'taken',
            when: () => true,
            run: () =>
                decide('inner', {}, [
                    {
                        name: 'taken',
                        when: () => true,
                        run: () => logger.info('innermost'),
                    },
                ]),
        },
    ]);
    const written = record(lines[0]);
    const chain = written.progress?.regions ?? [];
    t.equal(chain.length, 2, 'both branches are reported');
    t.equal(chain[0]?.discriminator, 'outer', 'the enclosing branch first');
    t.equal(chain[1]?.discriminator, 'inner');
    t.match(String(chain[1]?.id), /^\d+\.1$/, 'nested below its parent');
    t.equal(
        written.decision?.discriminator,
        'inner',
        'the innermost rationale is the one pending when the record was emitted',
    );
    t.end();
});

t.test('the identity carries the branch and the point names, and nothing else', t => {
    const inBranch = (regions: Progress['regions']): LogRecord => ({...base, progress: {regions}});
    const mark = (chosen: string, id: string) => ({
        id,
        discriminator: 'rate-within-limit',
        candidates: ['decline', 'accept'],
        chosen,
    });
    const here = serializeForIdentity(inBranch([mark('decline', '1')]));
    t.match(here, /\[REGION: rate-within-limit=decline\]/);
    t.notMatch(here, /\[CANDIDATES/, 'candidates are constant per call site and add nothing');
    t.equal(
        here,
        serializeForIdentity(inBranch([mark('decline', '7.3')])),
        'the id is a position, not structure: one branch at two places stays one template (R12)',
    );
    t.notSame(
        here,
        serializeForIdentity(inBranch([mark('accept', '1')])),
        'a different branch is a different template, so a rate-shift on one branch is measurable',
    );
    t.equal(
        serializeForIdentity(
            inBranch([{...mark('decline', '3'), discriminator: 'corridor'}, mark('accept', '3.1')]),
        ),
        serializeForIdentity(
            inBranch([{...mark('decline', '9'), discriminator: 'corridor'}, mark('accept', '9.1')]),
        ),
        'a nested pair is one template wherever it sits',
    );
    t.match(
        serializeForIdentity(
            inBranch([{...mark('decline', '3'), discriminator: 'corridor'}, mark('accept', '3.1')]),
        ),
        /\[REGION: corridor=decline\|rate-within-limit=accept\]/,
        'the whole chain reaches the identity, outermost first',
    );

    const withPoints = (points: unknown): LogRecord => ({...base, progress: {points} as Progress});
    const two = serializeForIdentity(
        withPoints([{name: 'total-calculated', data: {secret: 'x'}}, {name: 'order-created'}]),
    );
    t.match(two, /\[POINTS: total-calculated,order-created\]/, 'names, in the order announced');
    t.notMatch(two, /secret/, 'a point carries structure; its data is payload (R1, R10)');
    t.notSame(
        two,
        serializeForIdentity(withPoints([{name: 'total-calculated'}])),
        'adding or renaming a point changes the template',
    );
    t.notMatch(
        serializeForIdentity(withPoints([])),
        /\[POINTS/,
        'an empty list contributes nothing',
    );
    t.notMatch(
        serializeForIdentity(withPoints([null])),
        /\[POINTS/,
        'nor does one with nothing usable left in it',
    );
    t.end();
});

t.test('a redacted progress slot is never read as a mark', t => {
    // The slot is attached before redaction runs, so a caller's pattern can
    // replace the whole slot with the placeholder string. Identity minting must
    // not throw on it, and the rendered line must still say something.
    const collapsed = {...base, progress: '[redacted]'} as unknown as LogRecord;
    t.equal(
        serializeForIdentity(collapsed),
        serializeForIdentity(base),
        'a slot that is no longer a mark contributes nothing',
    );
    t.match(renderHuman(collapsed, {color: false, details: true}), /progress {2}\[redacted\]/);

    const partial = {
        ...base,
        progress: {
            regions: [{id: '1', discriminator: 'd', chosen: 'c', candidates: '[redacted]'}],
            points: '[redacted]',
        },
    } as unknown as LogRecord;
    t.match(
        serializeForIdentity(partial),
        /\[REGION: d=c\]/,
        'the branch still contributes when only its list was withheld',
    );
    t.notMatch(serializeForIdentity(partial), /\[POINTS/, 'a collapsed list contributes nothing');
    t.match(
        renderHuman(partial, {color: false, details: true}),
        /region: d -> c/,
        'and renders without the list',
    );

    const unusable = {
        ...base,
        progress: {regions: 'collapsed', points: 'collapsed'},
    } as unknown as LogRecord;
    t.equal(
        serializeForIdentity(unusable),
        serializeForIdentity(base),
        'a slot whose members are all collapsed contributes nothing at all',
    );
    t.match(
        renderHuman(unusable, {color: false, details: true}),
        /progress/,
        'but is still reported',
    );
    t.end();
});

t.test('a point whose shape survived only partly still renders the part that did', t => {
    const odd = {
        ...base,
        progress: {points: [null, {name: 42}, 'x', {name: 'kept', data: 1}]},
    } as unknown as LogRecord;
    t.match(serializeForIdentity(odd), /\[POINTS: kept\]/, 'only the usable names contribute');
    const line = renderHuman(odd, {color: false, details: true});
    t.match(line, /point: kept/);
    t.notMatch(line, /point: 42|point: x/, 'the unusable entries are not rendered as points');
    t.end();
});
