/**
 * Unit tests for the coverage comparison the report's movers section is built from
 * (report/metrics.ts). Coverage arrives as per-package line counts, the baseline holds
 * the same shape from the base branch, and what is under test is which packages count
 * as having moved and in what order they come out.
 */

import {test} from 'tap';

import type {ICoverage} from './coverage.ts';
import {coverageMovers, type IMetrics} from './metrics.ts';

function coverageOf(packages: Record<string, [number, number]>): ICoverage {
    const map = new Map<string, {hit: number; found: number}>();
    let hit = 0;
    let found = 0;
    for (const [pkg, [h, f]] of Object.entries(packages)) {
        map.set(pkg, {hit: h, found: f});
        hit += h;
        found += f;
    }
    return {lines: {hit, found}, packages: map};
}

function baselineOf(packages: Record<string, [number, number]>): IMetrics {
    const metrics: IMetrics['packages'] = {};
    for (const [pkg, [h, f]] of Object.entries(packages)) {
        metrics[pkg] = {coverage: {linesHit: h, linesTotal: f}};
    }
    return {
        schema: 1,
        commit: '',
        run: 1,
        updatedAt: '',
        tests: {total: 0, passed: 0, failed: 0, flaky: 0},
        coverage: {lines: {hit: 0, found: 0}},
        packages: metrics,
    };
}

test('coverageMovers ranks by how far a package moved', t => {
    const movers = coverageMovers(
        coverageOf({
            gained: [90, 100],
            lost: [10, 100],
            nudged: [71, 100],
            still: [50, 100],
        }),
        baselineOf({
            gained: [80, 100],
            lost: [20, 100],
            nudged: [70, 100],
            still: [50, 100],
        }),
    );

    t.same(
        movers.map(mover => mover.package),
        ['gained', 'lost', 'nudged'],
        'the biggest move first, whichever direction, then the smaller ones',
    );
    t.same(
        movers[0],
        {
            package: 'gained',
            pct: 90,
            deltaPp: 10,
            deltaLines: 10,
            hit: 90,
            found: 100,
        },
        'a gain carries its percentage, pp and line delta',
    );
    t.equal(movers[1]?.deltaPp, -10, 'a loss is negative');
    t.end();
});

test('coverageMovers ignores noise and packages it cannot compare', t => {
    const movers = coverageMovers(
        // `fresh` is new in this run and `empty` measured nothing: neither has a
        // baseline to move against, and `same` is where it was last time.
        coverageOf({same: [7100, 10_000], fresh: [50, 100], empty: [0, 0]}),
        baselineOf({same: [7099, 10_000]}),
    );

    t.same(movers, [], 'a change too small to see, a new package and an empty one are not news');

    // The default floor is the smallest move the percentages can express; a caller
    // that wants a quieter list can raise it.
    const small = coverageOf({nudged: [7120, 10_000]});
    const base = baselineOf({nudged: [7100, 10_000]});
    t.same(
        coverageMovers(small, base).map(mover => mover.deltaPp),
        [0.2],
        'a fifth of a point is reported by default',
    );
    t.same(
        coverageMovers(small, base, {minPoints: 0.5}),
        [],
        'and dropped when half a point is asked for',
    );
    t.end();
});

test('coverageMovers keeps the list short', t => {
    const now: Record<string, [number, number]> = {};
    const before: Record<string, [number, number]> = {};
    for (let index = 0; index < 10; index += 1) {
        now[`pkg-${index}`] = [50 + index * 5, 100];
        before[`pkg-${index}`] = [50, 100];
    }

    const movers = coverageMovers(coverageOf(now), baselineOf(before), {limit: 3});
    t.same(
        movers.map(mover => mover.package),
        ['pkg-9', 'pkg-8', 'pkg-7'],
        'the three that moved most',
    );
    t.end();
});

test('coverageMovers tolerates having nothing to compare', t => {
    t.same(coverageMovers(null, baselineOf({a: [1, 2]})), [], 'no coverage, no movers');
    t.same(coverageMovers(coverageOf({a: [1, 2]}), null), [], 'no baseline, no movers');
    t.end();
});
