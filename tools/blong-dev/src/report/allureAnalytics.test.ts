/**
 * Tests for rewriting the analytics tag Allure embeds in a report page.
 *
 * The fixture is the block Allure 3.17 writes: a loader for its own property and the
 * `gtag('config', …)` call beside it, among the scripts that must not be touched.
 */

import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {configuredAnalytics, rewriteAllureAnalytics} from './allureAnalytics.ts';

/** The page Allure writes, with the analytics block its template hardcodes. */
function allurePage(id = 'G-LNDJ3J7WT0'): string {
    return [
        '<!DOCTYPE html><html dir="ltr" lang="en"><head><title>Allure Report</title></head>',
        '<body>',
        '<script>window.allureReportOptions = {};</script>',
        `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
        '<script>',
        '        window.dataLayer = window.dataLayer || [];',
        '        function gtag(){dataLayer.push(arguments);}',
        "        gtag('js', new Date());",
        `        gtag('config', '${id}', {`,
        '          "report": "awesome"',
        '        });',
        '    </script>',
        '<script defer>window.allureReportDataReady = false;</script>',
        '</body></html>',
        '',
    ].join('\n');
}

function pageWith(html: string): {dir: string; file: string} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-allure-analytics-'));
    const file = join(dir, 'index.html');
    writeFileSync(file, html);
    return {dir, file};
}

test('points the analytics at another measurement ID', async t => {
    const {dir, file} = pageWith(allurePage());

    const result = rewriteAllureAnalytics(file, {id: 'G-MYOWN1234'});

    t.same(result, {changed: true, id: 'G-MYOWN1234'});
    const html = readFileSync(file, 'utf8');
    t.equal(html.includes('G-LNDJ3J7WT0'), false, 'nothing reports to Allure’s property');
    t.ok(
        html.includes('gtag/js?id=G-MYOWN1234'),
        'the loader fetches the configured measurement ID',
    );
    t.ok(html.includes("gtag('config', 'G-MYOWN1234'"), 'and the config call carries the same one');

    // The rest of the page is untouched: the report scripts and their order decide what
    // the reader sees.
    t.ok(html.includes('window.allureReportOptions'), 'the report options stay');
    t.ok(html.includes('window.allureReportDataReady'), 'the report data stays');

    rmSync(dir, {recursive: true, force: true});
});

test('removes the analytics entirely when asked', async t => {
    const {dir, file} = pageWith(allurePage());

    const result = rewriteAllureAnalytics(file, {off: true});

    t.same(result, {changed: true, removed: true});
    const html = readFileSync(file, 'utf8');
    t.equal(html.includes('googletagmanager.com'), false, 'no analytics script is loaded');
    t.equal(html.includes('window.dataLayer'), false, 'and no gtag setup is left behind');
    t.ok(html.includes('window.allureReportOptions'), 'the report scripts stay');
    t.ok(html.includes('window.allureReportDataReady'), 'including the report data');

    rmSync(dir, {recursive: true, force: true});
});

test('leaves the page alone without a setting', async t => {
    const {dir, file} = pageWith(allurePage());
    const before = readFileSync(file, 'utf8');

    const result = rewriteAllureAnalytics(file);

    t.same(result, {changed: false}, 'nothing was decided for this run');
    t.equal(readFileSync(file, 'utf8'), before, 'so the page is exactly what Allure wrote');

    rmSync(dir, {recursive: true, force: true});
});

test('refuses an ID that is not one, instead of writing it into the page', async t => {
    const {dir, file} = pageWith(allurePage());
    const before = readFileSync(file, 'utf8');
    const written: string[] = [];
    const original = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
        written.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;

    const result = rewriteAllureAnalytics(file, {id: 'G-1"><script>alert(1)</script>'});
    process.stderr.write = original;

    t.same(result, {changed: false}, 'the page is not rewritten');
    t.equal(readFileSync(file, 'utf8'), before, 'and keeps the tag Allure wrote');
    t.match(written.join(''), /not a measurement ID/, 'while the run says why');

    rmSync(dir, {recursive: true, force: true});
});

test('a page with no analytics is left alone', async t => {
    const html = '<!doctype html><html><body><script defer>ready();</script></body></html>';
    const {dir, file} = pageWith(html);

    t.same(rewriteAllureAnalytics(file, {off: true}), {changed: false});
    t.same(rewriteAllureAnalytics(file, {id: 'G-OTHER123'}), {changed: false});
    t.equal(readFileSync(file, 'utf8'), html, 'the page is untouched');

    rmSync(dir, {recursive: true, force: true});
});

test('a missing page is not an error', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-allure-analytics-'));

    t.same(rewriteAllureAnalytics(join(dir, 'index.html'), {off: true}), {changed: false});
    t.equal(existsSync(join(dir, 'index.html')), false, 'and nothing is created');

    rmSync(dir, {recursive: true, force: true});
});

test('the analytics setting comes from the environment', async t => {
    const previous = process.env['BLONG_ALLURE_GA_ID'];
    t.teardown(() => {
        if (previous === undefined) delete process.env['BLONG_ALLURE_GA_ID'];
        else process.env['BLONG_ALLURE_GA_ID'] = previous;
    });

    delete process.env['BLONG_ALLURE_GA_ID'];
    t.same(configuredAnalytics(), {}, 'unset leaves Allure’s own tag in place');

    for (const off of ['off', 'none', 'false', ' OFF ']) {
        process.env['BLONG_ALLURE_GA_ID'] = off;
        t.same(configuredAnalytics(), {off: true}, `"${off}" removes the analytics`);
    }

    process.env['BLONG_ALLURE_GA_ID'] = '  G-MYOWN1234  ';
    t.same(configuredAnalytics(), {id: 'G-MYOWN1234'}, 'a measurement ID is trimmed');
});
