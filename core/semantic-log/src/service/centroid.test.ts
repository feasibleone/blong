import t from 'tap';
import {DriftTracker, cosine, distance, updateCentroid} from './centroid.ts';

const unit = (values: number[]): number[] => {
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
    return values.map(value => value / norm);
};

t.test('a dot product of unit vectors is their cosine similarity', t => {
    t.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
    t.ok(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-9);
    t.ok(Math.abs(distance([1, 0], [1, 0])) < 1e-9);
    t.end();
});

t.test('the centroid moves toward new observations by the learning rate', t => {
    const moved = updateCentroid([1, 0], [0, 1], 0.5);
    t.same(moved, [0.5, 0.5]);
    const unmoved = updateCentroid([1, 0], [0, 1], 0);
    t.same(unmoved, [1, 0], 'rate 0 pins the centroid');
    t.end();
});

t.test('the first observation seeds the centroid without alerting', t => {
    const tracker = new DriftTracker({epsilon: 0.1, learningRate: 0.2});
    const result = tracker.observe('tpl-1', unit([1, 0, 0]));
    t.equal(result.drifted, false);
    t.equal(result.distance, 0);
    t.end();
});

t.test('a step change is drift, and the centroid absorbs it (PRD R6c)', t => {
    const tracker = new DriftTracker({epsilon: 0.1, learningRate: 0.2});
    tracker.observe('tpl-1', unit([1, 0, 0]));
    const drifted = tracker.observe('tpl-1', unit([0, 1, 0]));
    t.equal(drifted.drifted, true);
    t.ok(drifted.distance > 0.9, `distance was ${drifted.distance}`);

    // The centroid absorbs the change at the learning rate, so the alert fades
    // rather than latching: the distance falls by a factor of (1-rate) per
    // observation (1, 0.8, 0.64, ...) until it drops below epsilon. One
    // absorbing step is deliberately not enough at rate 0.2 — that is what
    // makes this a moving average rather than a reset — so the property to pin
    // is that repeating the new behaviour stops alerting, not that it stops
    // after a single observation.
    //
    // The rate is pinned explicitly before the loop: a reset implementation
    // would move the centroid all the way to the new vector, giving distance 0
    // on the repeat and skipping the loop entirely, so the bounded loop alone
    // cannot distinguish a moving average from a reset. One absorbing step
    // leaves [0.8, 0.2, 0] and the repeat then observes a distance of 0.8.
    const settled = tracker.centroidOf('tpl-1') ?? [];
    t.ok(Math.abs(settled[0] - 0.8) < 1e-9, `one absorbing step left centroid x ${settled[0]}`);
    t.ok(Math.abs(settled[1] - 0.2) < 1e-9, `one absorbing step left centroid y ${settled[1]}`);

    let again = tracker.observe('tpl-1', unit([0, 1, 0]));
    t.ok(Math.abs(again.distance - 0.8) < 1e-9, `one step absorbed at rate 0.2 leaves distance ${again.distance}`);

    for (let step = 0; again.drifted && step < 100; step++) {
        again = tracker.observe('tpl-1', unit([0, 1, 0]));
    }
    t.equal(again.drifted, false, 'the centroid has moved toward the new behaviour');
    t.end();
});

// The tracker keys its map by whatever ref it is handed — the service hands it
// a flow's stable kind (R6c, D4) — so the property here is per-key independence,
// not a statement about what a key means.
t.test('drift is tracked per key, independently', t => {
    const tracker = new DriftTracker({epsilon: 0.1, learningRate: 0.5});
    tracker.observe('a', unit([1, 0, 0]));
    tracker.observe('b', unit([0, 1, 0]));
    t.equal(tracker.observe('a', unit([1, 0, 0])).drifted, false);
    t.equal(tracker.observe('b', unit([0, 0, 1])).drifted, true);
    t.end();
});

// --- Paths the acceptance tests above do not reach ---------------------------------

t.test('an unobserved reference has no centroid to read (PRD R6c)', t => {
    const tracker = new DriftTracker({epsilon: 0.1, learningRate: 0.5});
    t.equal(tracker.centroidOf('never-observed'), undefined);
    t.end();
});

t.test('centroidOf hands out a copy, so reading the centroid cannot move it', t => {
    const tracker = new DriftTracker({epsilon: 0.1, learningRate: 0.5});
    tracker.observe('tpl-1', unit([1, 0, 0]));

    const read = tracker.centroidOf('tpl-1') ?? [];
    read[0] = 99;
    t.same(tracker.centroidOf('tpl-1'), unit([1, 0, 0]), 'a mutation of the read array did not reach the tracker');

    const peer = tracker.centroidOf('tpl-1') ?? [];
    peer[1] = 42;
    t.same(tracker.centroidOf('tpl-1'), unit([1, 0, 0]), 'and no later read sees an earlier reader edit');
    t.end();
});

t.test('the seed is copied on store, so the caller cannot move the centroid through its own array', t => {
    const tracker = new DriftTracker({epsilon: 0.1, learningRate: 0.5});
    const vector = unit([1, 0, 0]);
    tracker.observe('tpl-1', vector);
    vector[0] = 99;
    t.same(tracker.centroidOf('tpl-1'), unit([1, 0, 0]), 'the tracker kept its own copy of the seed');
    t.end();
});

t.test('a width mismatch is reported rather than zero-filled or truncated', t => {
    t.throws(() => updateCentroid([1, 0], [1], 0.5), RangeError, 'a short vector is not padded with zeros');
    t.throws(() => updateCentroid([1], [1, 0], 0.5), RangeError, 'a long vector is not truncated');
    t.throws(() => cosine([1, 0], [1]), RangeError, 'a short vector is not truncated by cosine');
    t.throws(() => cosine([1], [1, 0]), RangeError, 'a long vector is not truncated by cosine');
    t.throws(() => distance([1, 0], [1]), RangeError, 'a short vector is not truncated by distance');
    t.throws(() => distance([1], [1, 0]), RangeError, 'a long vector is not truncated by distance');
    t.end();
});
