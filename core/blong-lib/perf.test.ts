import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {
    perfHistogram,
    perfReport,
    perfSample,
    perfStats,
    perfSvg,
    perfWrite,
} from '@feasibleone/blong-lib/perf';

/**
 * The perf toolkit, pinned without a measurement (`@@D-1016`).
 *
 * What a report must not do is lie about a distribution: a percentile computed off an unsorted list,
 * a maximum with no bucket to land in, or an attachment Allure cannot find all read as a result
 * rather than as a bug. So the arithmetic and the files are asserted here, and a real run only has to
 * supply the numbers.
 */
test('perf.stats summarise a series by nearest rank', t => {
    const values = Array.from({length: 100}, (_, index) => index + 1);
    const stats = perfStats(values);
    t.equal(stats.count, 100, 'every sample counts');
    t.equal(stats.min, 1, 'the smallest is first after sorting');
    t.equal(stats.max, 100, 'and the largest is last');
    t.equal(stats.p50, 50, 'the median is the hundredth sample’s middle');
    t.equal(stats.p95, 95, 'p95 is the value 95% of the run is at or under');
    t.equal(stats.p99, 99, 'and p99 the one a spike shows up in');
    t.equal(stats.mean, 50.5, 'the mean is the sum over the count');
    t.same(
        perfStats([]),
        {count: 0, min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0},
        'a series that recorded nothing summarises to zero rather than to NaN',
    );
    t.end();
});

test('perf.histogram gives every value a bucket, the largest included', t => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const buckets = perfHistogram(values, {buckets: 5});
    t.equal(
        buckets.reduce((total, bucket) => total + bucket.count, 0),
        values.length,
        'the counts add up to the samples',
    );
    t.ok(
        buckets[buckets.length - 1].to >= 10,
        'the last bucket covers the maximum instead of dropping it',
    );
    t.same(perfHistogram([]), [], 'and an empty series has no distribution to draw');
    t.end();
});

test('perf.report states the environment, the table and the shape', t => {
    const warm = perfSample('warm', 'ms');
    const cold = perfSample('cold', 'ms');
    for (let index = 1; index <= 50; index++) warm.add(index);
    cold.add(120);
    cold.add(240);
    const report = perfReport({
        title: 'kafka telemetry burst latency',
        when: new Date('2026-11-24T10:00:00.000Z'),
        environment: {topic: 'blong.telemetry.perf', partitions: 12},
        notes: ['five bursts of 120 messages with 1500 ms of silence between them'],
        samples: [warm, cold],
        measures: [{label: 'send', value: 384.4, unit: 'msg/s'}],
    });
    t.match(report.text, /^# kafka telemetry burst latency/, 'the title comes first');
    t.match(report.text, /2026-11-24T10:00:00\.000Z/, 'the run names when it happened');
    t.match(report.text, /topic\s+\|\s+blong\.telemetry\.perf/, 'and what it measured');
    t.match(report.text, /\| warm\s+\|\s+50\s+\|\s+1\s+\|/, 'a row per series, with its count');
    t.match(
        report.text,
        /\| cold\s+\|\s+2\s+/,
        'the small series is reported beside the large one',
    );
    t.match(report.text, /\| send\s+\|\s+384\.40\s+\|\s+msg\/s/, 'and the throughput is a number');
    t.match(report.text, /### warm \(ms\)/, 'each series has its own histogram');
    t.match(report.text, /█/, 'drawn as bars, so the shape reads without the chart');
    t.match(report.svg, /^<svg xmlns/, 'the chart is a standalone image');
    t.match(report.svg, /warm — ms/, 'naming the series it draws');
    t.end();
});

test('perf.svg escapes what a title may carry', t => {
    const sample = perfSample('a <b> & "c"');
    sample.add(1);
    const svg = perfSvg([sample]);
    t.notMatch(svg, /<b>/, 'a label never becomes markup');
    t.match(svg, /&#60;b&#62;/, 'it is escaped instead');
    t.end();
});

test('perf.write leaves readable files and an attachment Allure can find', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-perf-'));
    try {
        const sample = perfSample('warm', 'ms');
        for (const value of [1, 2, 3, 4, 5]) sample.add(value);
        const report = perfReport({
            title: 'isolated produce and consume',
            samples: [sample],
            measures: [{label: 'drain', value: 400, unit: 'msg/s'}],
        });
        const written = await perfWrite({
            report,
            name: 'isolated',
            dir,
            resultsDir: join(dir, 'allure-results-tap'),
        });
        t.equal(
            await readFile(written.text, 'utf-8'),
            report.text,
            'the text report is on disk as written',
        );
        t.match(await readFile(written.svg, 'utf-8'), /<svg/, 'and so is the chart');
        t.ok(written.result, 'a result file was written for Allure');
        const result = JSON.parse(await readFile(written.result!, 'utf-8')) as {
            attachments: {type: string; source: string}[];
            status: string;
        };
        t.same(
            result.attachments.map(attachment => attachment.type).sort(),
            ['image/svg+xml', 'text/plain'],
            'the result carries the text and the picture',
        );
        for (const attachment of result.attachments) {
            t.ok(
                await readFile(join(dir, 'allure-results-tap', attachment.source), 'utf-8'),
                `the attachment ${attachment.source} is beside the result that names it`,
            );
        }
        t.equal(result.status, 'passed', 'a perf report is not a failure');
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
    t.end();
});
