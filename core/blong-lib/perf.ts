/**
 * perf.ts — measure a run, summarise it, and leave a report behind (`@@D-1016`).
 *
 * A performance test that only asserts a number leaves nothing to look at when the number is
 * *unexpectedly* large: the shape of the distribution is what says whether a spike is a tail or a
 * cliff, and whether one series (the first message after a silence, say) is a different population
 * from the rest. So the pieces here are separate on purpose — a sampler, a summary, a histogram, a
 * text report, a chart — and a test combines the ones it needs.
 *
 * Nothing here knows about Kafka, a broker or a framework: a caller times what it likes and hands
 * the numbers over, which is what makes the same report serve the next transport measured.
 */
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {hostname} from 'node:os';
import {join} from 'node:path';

/** One named set of numbers a run recorded, all in the same unit. */
export interface IPerfSample {
    label: string;
    unit: string;
    values: number[];
    add: (value: number) => void;
}

/** A sample set to record into: `const latency = perfSample('warm', 'ms')`. */
export const perfSample = (label: string, unit = 'ms'): IPerfSample => {
    const values: number[] = [];
    return {
        label,
        unit,
        values,
        add: (value: number) => {
            values.push(value);
        },
    };
};

export interface IPerfStats {
    count: number;
    min: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
}

const EMPTY_STATS: IPerfStats = {
    count: 0,
    min: 0,
    p50: 0,
    p90: 0,
    p95: 0,
    p99: 0,
    max: 0,
    mean: 0,
};

/** Nearest-rank percentile: the value a reader of this many samples has seen by now. */
const percentileOf = (sorted: number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;

/** What a series adds up to, or the zero summary for one that recorded nothing. */
export const perfStats = (values: number[]): IPerfStats => {
    if (values.length === 0) return {...EMPTY_STATS};
    const sorted = [...values].sort((left, right) => left - right);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
        count: sorted.length,
        min: sorted[0],
        p50: percentileOf(sorted, 0.5),
        p90: percentileOf(sorted, 0.9),
        p95: percentileOf(sorted, 0.95),
        p99: percentileOf(sorted, 0.99),
        max: sorted[sorted.length - 1],
        // Two decimals: a mean of milliseconds is read at this precision, and more is noise.
        mean: Math.round((sum / sorted.length) * 100) / 100,
    };
};

export interface IPerfBucket {
    from: number;
    to: number;
    count: number;
}

/** A step that makes the axis readable: 1, 2, 5 or 10 times a power of ten. */
const niceStep = (rough: number): number => {
    if (!Number.isFinite(rough) || rough <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const normalised = rough / magnitude;
    const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
    return step * magnitude;
};

/**
 * The distribution, as buckets a chart can draw.
 *
 * The last bucket is open-ended, so the maximum always has a home; every bucket carries the range it
 * covers so a reader of the text report sees where the mass is rather than only how much of it there
 * is.
 */
export const perfHistogram = (
    values: number[],
    options: {buckets?: number} = {},
): IPerfBucket[] => {
    if (values.length === 0) return [];
    const wanted = Math.max(1, Math.min(options.buckets ?? 12, 60));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = niceStep((max - min) / wanted) || 1;
    const start = Math.floor(min / step) * step;
    const buckets: IPerfBucket[] = [];
    for (let from = start; from <= max; from += step) {
        buckets.push({
            from: Math.round(from * 100) / 100,
            to: Math.round((from + step) * 100) / 100,
            count: 0,
        });
    }
    for (const value of values) {
        // The bucket a value belongs to, with the last one holding the maximum.
        const index = Math.min(buckets.length - 1, Math.max(0, Math.floor((value - start) / step)));
        buckets[index].count += 1;
    }
    return buckets;
};

/** A number the report states rather than distributes: a throughput, a count, a size. */
export interface IPerfMeasure {
    label: string;
    value: number;
    unit: string;
}

export interface IPerfReportInput {
    title: string;
    /** When the measurement ran; defaults to now. */
    when?: Date;
    /** What the numbers describe — the broker, the topic, the message. One line each. */
    environment?: Record<string, string | number>;
    /** Prose a reader needs before the tables: what was done, and in what order. */
    notes?: string[];
    samples: IPerfSample[];
    measures?: IPerfMeasure[];
    /** Buckets per histogram; 12 unless a caller wants a different resolution. */
    histogram?: {buckets?: number};
}

export interface IPerfReport {
    /** The title the report was built with, which names its attachments. */
    title: string;
    /** The report as a reader gets it in a log or a text attachment. */
    text: string;
    /** The same distributions as a standalone SVG, which Allure renders as an image. */
    svg: string;
}

const pad = (value: string | number, width: number): string => String(value).padStart(width);

const cell = (value: string | number, width: number, align: 'left' | 'right' = 'right'): string =>
    align === 'left' ? String(value).padEnd(width) : pad(value, width);

/** A markdown table, since the text report is read as markdown as often as as plain text. */
const tableOf = (header: string[], rows: string[][], aligns: ('left' | 'right')[]): string[] => {
    const widths = header.map((title, column) =>
        Math.max(title.length, ...rows.map(row => String(row[column] ?? '').length)),
    );
    const line = (row: string[]): string =>
        `| ${row.map((value, column) => cell(value, widths[column], aligns[column])).join(' | ')} |`;
    return [
        line(header),
        `| ${widths.map((width, column) => (aligns[column] === 'left' ? '-'.repeat(width) : `${'-'.repeat(Math.max(1, width - 1))}:`)).join(' | ')} |`,
        ...rows.map(line),
    ];
};

/** Bars for a text histogram, scaled so the fullest bucket is a fixed width. */
const BAR_WIDTH = 32;

const barOf = (count: number, fullest: number): string =>
    count === 0
        ? ''
        : '█'.repeat(Math.max(1, Math.round((count / Math.max(1, fullest)) * BAR_WIDTH)));

const escapeXml = (text: string): string =>
    text.replace(/[<>&"']/g, character => `&#${character.charCodeAt(0)};`);

/** One sample's distribution as a stacked bar chart, in SVG. */
const svgChartOf = (sample: IPerfSample, top: number, buckets: number): string => {
    const bars = perfHistogram(sample.values, {buckets});
    const stats = perfStats(sample.values);
    const width = 640;
    const barHeight = 14;
    const gap = 2;
    const chartHeight = Math.max(1, bars.length) * (barHeight + gap);
    const fullest = Math.max(1, ...bars.map(bucket => bucket.count));
    const peak = `min ${stats.min} · p50 ${stats.p50} · p95 ${stats.p95} · max ${stats.max} (${sample.unit})`;
    const lines = bars.map((bucket, index) => {
        const y = top + 24 + index * (barHeight + gap);
        const length = Math.round((bucket.count / fullest) * (width - 160));
        return [
            `<text x="0" y="${y + 11}" font-size="10" fill="#555">${escapeXml(`${bucket.from}–${bucket.to}`)}</text>`,
            `<rect x="92" y="${y}" width="${Math.max(0, length)}" height="${barHeight}" fill="#4c78a8"/>`,
            `<text x="${96 + Math.max(0, length)}" y="${y + 11}" font-size="10" fill="#333">${bucket.count}</text>`,
        ].join('');
    });
    return [
        `<text x="0" y="${top + 12}" font-size="13" font-weight="bold">${escapeXml(`${sample.label} — ${sample.unit}`)}</text>`,
        `<text x="0" y="${top + 24}" font-size="10" fill="#666">${escapeXml(peak)}</text>`,
        ...lines,
        `<line x1="92" y1="${top + 24}" x2="92" y2="${top + 24 + chartHeight}" stroke="#999" stroke-width="1"/>`,
    ].join('\n');
};

/** The distributions as one standalone SVG, so a report can show a picture of the shape. */
export const perfSvg = (samples: IPerfSample[], options: {buckets?: number} = {}): string => {
    const buckets = options.buckets ?? 12;
    const charts = samples.filter(sample => sample.values.length > 0);
    const heights = charts.map(sample =>
        Math.max(1, perfHistogram(sample.values, {buckets}).length),
    );
    const height = 24 + heights.reduce((total, rows) => total + rows * 16 + 40, 0);
    let top = 8;
    const body = charts
        .map(sample => {
            const chart = svgChartOf(sample, top, buckets);
            top += Math.max(1, perfHistogram(sample.values, {buckets}).length) * 16 + 40;
            return chart;
        })
        .join('\n');
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${Math.max(60, height)}" viewBox="0 0 720 ${Math.max(60, height)}" font-family="system-ui, sans-serif" fill="#222">`,
        `<rect width="720" height="${Math.max(60, height)}" fill="#ffffff"/>`,
        body,
        '</svg>',
        '',
    ].join('\n');
};

/**
 * The report: what ran, where, and the shape of every series it recorded.
 *
 * The tables are markdown because the same text is printed to a log, written as a `.txt` attachment
 * and read by a person in an editor; the histograms below them are plain text so a spike is visible
 * without opening the chart.
 */
export const perfReport = (input: IPerfReportInput): IPerfReport => {
    const when = input.when ?? new Date();
    const buckets = input.histogram?.buckets ?? 12;
    const lines: string[] = [`# ${input.title}`, ''];

    lines.push(
        ...tableOf(
            ['', ''],
            [
                ['when', when.toISOString()],
                ['host', hostname()],
                ['runtime', `node ${process.version}`],
                ...Object.entries(input.environment ?? {}).map(
                    ([key, value]) => [key, String(value)] as [string, string],
                ),
            ],
            ['left', 'left'],
        ),
    );

    if (input.notes?.length) {
        lines.push('', '## What ran', '', ...input.notes.map(note => `- ${note}`));
    }

    const measured = input.samples.filter(sample => sample.values.length > 0);
    if (measured.length > 0) {
        const units = [...new Set(measured.map(sample => sample.unit))].join(', ');
        lines.push(
            '',
            `## distribution (${units})`,
            '',
            ...tableOf(
                ['sample', 'count', 'min', 'p50', 'p90', 'p95', 'p99', 'max', 'mean'],
                measured.map(sample => {
                    const stats = perfStats(sample.values);
                    return [
                        sample.label,
                        String(stats.count),
                        String(stats.min),
                        String(stats.p50),
                        String(stats.p90),
                        String(stats.p95),
                        String(stats.p99),
                        String(stats.max),
                        String(stats.mean),
                    ];
                }),
                ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
            ),
        );
        lines.push('');
        for (const sample of measured) {
            const bars = perfHistogram(sample.values, {buckets});
            const fullest = Math.max(1, ...bars.map(bucket => bucket.count));
            lines.push(`### ${sample.label} (${sample.unit})`, '');
            for (const bucket of bars) {
                lines.push(
                    `\`${String(bucket.from).padStart(7)}–${String(bucket.to).padEnd(7)}\` ${pad(bucket.count, 5)} ${barOf(bucket.count, fullest)}`.trimEnd(),
                );
            }
            lines.push('');
        }
    }

    if (input.measures?.length) {
        lines.push(
            '## throughput and counts',
            '',
            ...tableOf(
                ['measure', 'value', 'unit'],
                input.measures.map(measure => [
                    measure.label,
                    measure.value.toFixed(2),
                    measure.unit,
                ]),
                ['left', 'right', 'left'],
            ),
            '',
        );
    }

    return {
        title: input.title,
        text: `${lines.join('\n').trimEnd()}\n`,
        svg: perfSvg(measured, {buckets}),
    };
};

export interface IPerfWriteOptions {
    /** The report to write, from {@link perfReport}. */
    report: IPerfReport;
    /** File stem, without an extension: `kafka-burst-latency`. */
    name: string;
    /**
     * Where the readable files go.
     *
     * The Allure results directory when the run has one — that is where a report is collected from,
     * and a `.txt` dropped in a package root is a file nobody expects and nothing cleans up.
     */
    dir?: string;
    /**
     * The Allure results directory, when the run has one.
     *
     * Both files are written again under the names that directory expects (`<uuid>-attachment…`) and
     * a result file references them, which is what puts the distribution and the chart in the Allure
     * report beside the test that produced them. With no directory the files are only written to
     * `dir`, and a run that reports nothing to Allure still leaves its numbers behind.
     */
    resultsDir?: string;
    /** The result's name in Allure, which is the report's title unless a caller says otherwise. */
    resultName?: string;
}

export interface IPerfWriteResult {
    /** The plain text report. */
    text: string;
    /** The chart beside it. */
    svg: string;
    /** The Allure result file, when one was written. */
    result?: string;
}

/**
 * Write a report where a person and a report pipeline can both find it.
 *
 * The files keep their readable names under `dir`, and — when an Allure results directory exists —
 * are copied under the `uuid-attachment` names Allure reads, with one result file referencing them.
 * A perf run is not a test step, so it gets a result of its own: it is the one place a reader of the
 * report can see the distribution without opening a log.
 */
export const perfWrite = async (options: IPerfWriteOptions): Promise<IPerfWriteResult> => {
    const dir = options.dir ?? options.resultsDir ?? process.cwd();
    await mkdir(dir, {recursive: true});
    const textPath = join(dir, `${options.name}.txt`);
    const svgPath = join(dir, `${options.name}.svg`);
    await writeFile(textPath, options.report.text, 'utf-8');
    await writeFile(svgPath, options.report.svg, 'utf-8');
    if (!options.resultsDir) return {text: textPath, svg: svgPath};

    await mkdir(options.resultsDir, {recursive: true});
    const uuid = randomUUID();
    const textSource = `${uuid}-attachment.txt`;
    const svgSource = `${uuid}-attachment.svg`;
    await writeFile(join(options.resultsDir, textSource), options.report.text, 'utf-8');
    await writeFile(join(options.resultsDir, svgSource), options.report.svg, 'utf-8');
    const name = options.resultName ?? options.report.title;
    const now = Date.now();
    const result = {
        uuid,
        // The same run twice is one entry in the history, which is what makes two perf runs
        // comparable in the report rather than two strangers.
        historyId: createHash('md5').update(`perf.${options.name}`).digest('hex'),
        fullName: `perf.${name}`,
        name,
        status: 'passed',
        stage: 'finished',
        labels: [
            {name: 'tag', value: 'perf'},
            {name: 'suite', value: 'performance'},
        ],
        start: now,
        stop: now,
        attachments: [
            {name: `${name} (text)`, type: 'text/plain', source: textSource},
            {name: `${name} (chart)`, type: 'image/svg+xml', source: svgSource},
        ],
    };
    const resultPath = join(options.resultsDir, `${uuid}-result.json`);
    await writeFile(resultPath, JSON.stringify(result, null, 2), 'utf-8');
    return {text: textPath, svg: svgPath, result: resultPath};
};
