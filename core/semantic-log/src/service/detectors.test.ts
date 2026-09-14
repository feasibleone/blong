import t from 'tap';
import {DetectorSuite, type Anomaly} from './detectors.ts';

const unit = (values: number[]): number[] => {
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
    return values.map(value => value / norm);
};

function suite(): DetectorSuite {
    return new DetectorSuite({
        drift: {epsilon: 0.1, learningRate: 0.2},
        rate: {windowMs: 1000, buckets: 5, zThreshold: 3},
    });
}

t.test('novelty fires on a first-seen fingerprint with no configuration (PRD R6a)', t => {
    const detectors = suite();
    const anomalies = detectors.observe({ref: 'r1', novel: true, time: 0, vector: unit([1, 0, 0])});
    t.equal(anomalies.length, 1);
    t.equal(anomalies[0].kind, 'novelty');
    t.equal(anomalies[0].ref, 'r1');
    t.end();
});

t.test('a known fingerprint produces no novelty', t => {
    const detectors = suite();
    detectors.observe({ref: 'r1', novel: true, time: 0, vector: unit([1, 0, 0])});
    t.same(detectors.observe({ref: 'r1', novel: false, time: 10, vector: unit([1, 0, 0])}), []);
    t.end();
});

t.test('drift is a distinct event type from novelty (PRD R6 acceptance)', t => {
    const detectors = suite();
    detectors.observe({ref: 'r1', novel: true, time: 0, vector: unit([1, 0, 0])});
    const anomalies = detectors.observe({ref: 'r1', novel: false, time: 10, vector: unit([0, 1, 0])});
    t.equal(anomalies.length, 1);
    t.equal(anomalies[0].kind, 'drift');
    t.not(anomalies[0].kind, 'novelty');
    t.end();
});

t.test('a steady rate produces nothing, a surge produces rate-shift (PRD R6b)', t => {
    const detectors = suite();
    detectors.observe({ref: 'r1', novel: true, time: 0, vector: unit([1, 0, 0])});
    // One observation in each of the five baseline windows (1, 1001, 2001,
    // 3001, 4001): the bound must reach the fifth window, or the tracker still
    // has an unfilled baseline when the surge arrives.
    for (let time = 1; time <= 4001; time += 1000) {
        detectors.observe({ref: 'r1', novel: false, time, vector: unit([1, 0, 0])});
    }
    t.equal(
        detectors.observe({ref: 'r1', novel: false, time: 5000, vector: unit([1, 0, 0])}).filter(a => a.kind === 'rate-shift').length,
        0,
        'one per window is the baseline',
    );
    let surge = detectors.observe({ref: 'r1', novel: false, time: 5000, vector: unit([1, 0, 0])});
    for (let i = 0; i < 40 && surge.filter(a => a.kind === 'rate-shift').length === 0; i++) {
        surge = detectors.observe({ref: 'r1', novel: false, time: 5000, vector: unit([1, 0, 0])});
    }
    t.equal(surge.filter(a => a.kind === 'rate-shift').length, 1, 'a surge in one window is rate-shift');
    t.end();
});

t.test('rate-shift needs a baseline before it can fire', t => {
    const detectors = suite();
    detectors.observe({ref: 'fresh', novel: true, time: 0, vector: unit([1, 0, 0])});
    for (let i = 0; i < 100; i++) {
        const anomalies = detectors.observe({ref: 'fresh', novel: false, time: 1, vector: unit([1, 0, 0])});
        t.notMatch(anomalies.map(a => a.kind).join(','), /rate-shift/, 'no false positive from a cold baseline');
    }
    t.end();
});

// --- Paths the acceptance tests above do not reach ---------------------------

t.test('centroidOf delegates to the tracker, and an unobserved ref has none', t => {
    const detectors = suite();
    t.equal(detectors.centroidOf('never-observed'), undefined, 'nothing to compare against is not a zero vector');

    detectors.observe({ref: 'r1', novel: true, time: 0, vector: unit([1, 0, 0])});
    t.same(detectors.centroidOf('r1'), unit([1, 0, 0]));

    const read = detectors.centroidOf('r1') ?? [];
    read[0] = 99;
    t.same(detectors.centroidOf('r1'), unit([1, 0, 0]), 'the delegation keeps the copy-on-read contract');
    t.end();
});

t.test('drift carries the distance as its magnitude and in its detail', t => {
    const detectors = suite();
    detectors.observe({ref: 'r1', novel: true, time: 0, vector: unit([1, 0, 0])});
    const [drift] = detectors.observe({ref: 'r1', novel: false, time: 10, vector: unit([0, 1, 0])});
    t.equal(drift.magnitude, 1, 'a perpendicular step is a distance of 1');
    t.equal(drift.detail, 'distance 1.000');
    t.end();
});

t.test('a baseline with no spread has no z-score, so the score is reported as unbounded', t => {
    const detectors = suite();
    // One occurrence in each of five windows gives five equal counts, whose
    // deviation is zero: there is no finite number of standard deviations by
    // which the sixth window exceeds the mean.
    for (let time = 0; time <= 4000; time += 1000) {
        detectors.observe({ref: 'flat', novel: false, time, vector: unit([1, 0, 0])});
    }
    t.same(
        detectors.observe({ref: 'flat', novel: false, time: 5000, vector: unit([1, 0, 0])}),
        [],
        'matching a flat baseline is not a surge',
    );

    const [surge] = detectors.observe({ref: 'flat', novel: false, time: 5000, vector: unit([1, 0, 0])});
    t.equal(surge.kind, 'rate-shift');
    t.equal(surge.magnitude, undefined, 'an unbounded score has no finite magnitude to report');
    t.equal(surge.detail, 'first observation above a flat baseline');
    t.end();
});

t.test('an old burst ages out of the bounded baseline, so a later surge is still a surge', t => {
    const detectors = suite();
    const record = (time: number, count: number): Anomaly[] => {
        let found: Anomaly[] = [];
        for (let i = 0; i < count; i++) {
            found = detectors.observe({ref: 'aging', novel: false, time, vector: unit([1, 0, 0])});
        }
        return found;
    };

    record(0, 10); // a burst that leaves the baseline once five windows have passed
    for (let window = 1; window <= 5; window++) {
        record(window * 1000, 1);
    }

    t.equal(record(6000, 1).filter(a => a.kind === 'rate-shift').length, 0, 'five equal counts are a flat baseline');
    t.equal(
        record(6000, 3).filter(a => a.kind === 'rate-shift').length,
        1,
        'the aged-out burst no longer masks the new one',
    );
    t.end();
});

t.test('one observation can be both new and drifting', t => {
    const detectors = suite();
    detectors.observe({ref: 'r1', novel: false, time: 0, vector: unit([1, 0, 0])});
    const anomalies = detectors.observe({ref: 'r1', novel: true, time: 10, vector: unit([0, 1, 0])});
    t.same(anomalies.map(a => a.kind), ['novelty', 'drift']);
    t.end();
});

t.test('drift can be keyed separately from the template, or withheld (PRD R6c, amendment)', t => {
    const detectors = suite();
    // The flow's baseline is seeded through the drift key, never as the primary
    // ref, because `observe` keys the rate tracker by the primary ref only: a
    // flow's stable kind observed as a ref would acquire a rate baseline it has
    // no business having.
    detectors.observe({
        ref: 'template-a',
        novel: false,
        time: 0,
        vector: unit([1, 0, 0]),
        drift: {ref: 'flow-1', vector: unit([1, 0, 0])},
    });

    // A template observation carrying the flow's drift: novelty and rate stay
    // on the template, and the anomaly names the key drift was measured on.
    const anomalies = detectors.observe({
        ref: 'template-a',
        novel: false,
        time: 10,
        vector: unit([1, 0, 0]),
        drift: {ref: 'flow-1', vector: unit([0, 1, 0])},
    });
    t.same(anomalies.map(a => a.kind), ['drift']);
    t.equal(anomalies[0].ref, 'flow-1', 'the anomaly names the key it was measured on, not the template');
    t.equal(detectors.centroidOf('template-a'), undefined, 'the template was not given a drift baseline');
    t.ok(detectors.centroidOf('flow-1'), 'the flow was');

    t.same(
        detectors.observe({ref: 'template-a', novel: false, time: 11, vector: unit([1, 0, 0]), drift: null}),
        [],
        'a withheld drift observation produces nothing',
    );
    t.end();
});
