/**
 * Tests for moving Allure's inlined application bundle out of a report page.
 *
 * The fixture is the shape Allure writes: the bundle as a base64 `data:` URL in a
 * `src` attribute, beside the report data and the page's own scripts that must not be
 * touched.
 */

import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {BUNDLE_FILE, configuredBundle, externalizeAllureMain} from './allureMain.ts';

/** Something shaped like a minified bundle, large enough to be worth moving out. */
const BUNDLE = Buffer.from(
    '/*! For license information please see app-e10ef08e2435570d7f42.js.LICENSE.txt */\n' +
        '!function(){var e,t,n={3175:function(e,t,n){"use strict"}};e=1}();\n',
);

function workspace(): string {
    return mkdtempSync(join(tmpdir(), 'blong-allure-main-'));
}

/** The page Allure writes: the bundle inlined, and the scripts that must stay. */
function allurePage(bundle: Buffer, extra = ''): string {
    return [
        '<!DOCTYPE html>',
        '<html dir="ltr" lang="en"><head><meta charset="utf-8"><title>Allure Report</title></head>',
        '<body>',
        '<script>',
        'window.allureReportOptions = {"id":"awesome"};',
        '</script>',
        `<script   src="data:text/javascript;base64,${bundle.toString('base64')}"></script>`,
        '<script async src="https://www.googletagmanager.com/gtag/js?id=G-LNDJ3J7WT0"></script>',
        '<script defer>',
        'window.allureReportDataReady = false;',
        '</script>',
        extra,
        '</body></html>',
        '',
    ].join('\n');
}

test('moves the inlined bundle beside the page and points the tag at it', async t => {
    const dir = workspace();
    const file = join(dir, 'index.html');
    const before = allurePage(BUNDLE);
    writeFileSync(file, before);

    const result = externalizeAllureMain(file);

    t.equal(result.files.length, 1, 'one bundle was moved out');
    const name = result.files[0]!;
    t.match(name, BUNDLE_FILE, 'the file name is content addressed');
    t.equal(
        readFileSync(join(dir, name)).toString('base64'),
        BUNDLE.toString('base64'),
        'the decoded bundle is byte-for-byte what the page inlined',
    );
    t.ok(result.bytes > 0, 'the page got smaller');

    const after = readFileSync(file, 'utf8');
    t.equal(after.includes('data:text/javascript'), false, 'no inlined JavaScript is left');
    t.match(
        after,
        new RegExp(`<script   src="\\./${name}"></script>`),
        'the tag points at the file beside it',
    );
    t.ok(after.length < before.length, 'and the page is smaller than it was');
    t.equal(after.length, before.length - result.bytes, 'the saving is the data URL it removed');

    // Everything that is not the bundle is untouched: order matters for the page's own
    // options and report data, and the analytics tag is not ours to rewrite.
    t.match(after, /<script>\nwindow\.allureReportOptions/, 'the options script stays first');
    t.match(
        after,
        /<script async src="https:\/\/www\.googletagmanager\.com/,
        'the analytics tag stays',
    );
    t.match(after, /<script defer>\nwindow\.allureReportDataReady/, 'the report data stays inline');

    rmSync(dir, {recursive: true, force: true});
});

test('the same bundle has the same name in every report', async t => {
    const first = workspace();
    const second = workspace();
    const one = join(first, 'index.html');
    const two = join(second, 'index.html');
    writeFileSync(one, allurePage(BUNDLE));
    writeFileSync(two, allurePage(BUNDLE));

    const a = externalizeAllureMain(one);
    const b = externalizeAllureMain(two);

    t.equal(a.files[0], b.files[0], 'two pages reference one file name');
    t.equal(
        readFileSync(join(first, a.files[0]!)).toString('base64'),
        readFileSync(join(second, b.files[0]!)).toString('base64'),
        'with identical content, which is what a repository deduplicates',
    );

    rmSync(first, {recursive: true, force: true});
    rmSync(second, {recursive: true, force: true});
});

test('a report that was already externalized is left alone', async t => {
    const dir = workspace();
    const file = join(dir, 'index.html');
    writeFileSync(file, allurePage(BUNDLE));
    externalizeAllureMain(file);
    const once = readFileSync(file, 'utf8');

    const again = externalizeAllureMain(file);

    t.equal(again.files.length, 0, 'nothing was moved a second time');
    t.equal(again.bytes, 0, 'and nothing was saved twice');
    t.equal(readFileSync(file, 'utf8'), once, 'the page is unchanged');
    t.same(readdirSync(dir).filter(entry => BUNDLE_FILE.test(entry)).length, 1, 'one bundle file');

    rmSync(dir, {recursive: true, force: true});
});

test('a bundle from another Allure version replaces the old file', async t => {
    const dir = workspace();
    const file = join(dir, 'index.html');
    writeFileSync(file, allurePage(BUNDLE));
    const older = externalizeAllureMain(file).files[0]!;

    // A later report built by a newer Allure writes a new page and its own bundle.
    const newer = Buffer.from('!function(){var version="3.18.0"}();\n');
    writeFileSync(file, allurePage(newer));
    const current = externalizeAllureMain(file).files[0]!;

    t.not(older, current, 'the new bundle has its own name');
    t.ok(existsSync(join(dir, current)), 'it is written');
    t.equal(existsSync(join(dir, older)), false, 'the file nothing references is removed');

    rmSync(dir, {recursive: true, force: true});
});

test('a configured URL points the page at that directory', async t => {
    const dir = workspace();
    const file = join(dir, 'index.html');
    writeFileSync(file, allurePage(BUNDLE));

    const url = 'https://cdn.example.test/allure/';
    const result = externalizeAllureMain(file, {url});

    t.equal(result.files.length, 1, 'the bundle is written so it can be hosted');
    t.ok(existsSync(join(dir, result.files[0]!)), 'beside the page, where it is easy to find');
    t.equal(
        result.reference,
        `https://cdn.example.test/allure/${result.files[0]}`,
        'the page loads it from the configured directory, without a doubled slash',
    );
    t.ok(
        readFileSync(file, 'utf8').includes(`src="${result.reference}"`),
        'the page points at the URL',
    );

    rmSync(dir, {recursive: true, force: true});
});

test('every report shares one bundle in a shared directory', async t => {
    const one = workspace();
    const two = workspace();
    const shared = workspace();
    const first = join(one, 'index.html');
    const second = join(two, 'index.html');
    writeFileSync(first, allurePage(BUNDLE));
    writeFileSync(second, allurePage(BUNDLE));

    const options = {url: '../../../_assets/allure', dir: shared};
    const a = externalizeAllureMain(first, options);
    const b = externalizeAllureMain(second, options);

    t.same(readdirSync(shared), [a.files[0]], 'the bundle is written once in the shared directory');
    t.equal(a.files[0], b.files[0], 'both pages reference the same name');
    for (const [page, result] of [
        [first, a],
        [second, b],
    ] as const) {
        t.ok(
            readFileSync(page, 'utf8').includes(`src="../../../_assets/allure/${result.files[0]}"`),
            'the page points three levels up, where every report is the same depth',
        );
    }
    t.same(readdirSync(one), ['index.html'], 'no bundle is left beside the first page');
    t.same(readdirSync(two), ['index.html'], 'nor beside the second');

    rmSync(one, {recursive: true, force: true});
    rmSync(two, {recursive: true, force: true});
    rmSync(shared, {recursive: true, force: true});
});

test('a shared directory without a URL still keeps the file beside the page', async t => {
    const dir = workspace();
    const shared = workspace();
    const file = join(dir, 'index.html');
    writeFileSync(file, allurePage(BUNDLE));

    const result = externalizeAllureMain(file, {dir: shared});

    t.ok(existsSync(join(dir, result.files[0]!)), 'the file is beside the page');
    t.same(readdirSync(shared), [], 'nothing is written to a directory no page points at');
    t.ok(
        readFileSync(file, 'utf8').includes(`src="./${result.files[0]}"`),
        'the page keeps its self-contained reference',
    );

    rmSync(dir, {recursive: true, force: true});
    rmSync(shared, {recursive: true, force: true});
});

test('a page with nothing inlined is not rewritten', async t => {
    const dir = workspace();
    const file = join(dir, 'index.html');
    const html = '<!doctype html><html><body><script src="./main.js"></script></body></html>';
    writeFileSync(file, html);

    const result = externalizeAllureMain(file);

    t.same(result.files, [], 'nothing to move');
    t.equal(result.bytes, 0, 'nothing was saved');
    t.equal(readFileSync(file, 'utf8'), html, 'the page is untouched');

    rmSync(dir, {recursive: true, force: true});
});

test('a data URL that is not base64 JavaScript is left in place', async t => {
    const dir = workspace();
    const file = join(dir, 'index.html');
    const html =
        '<!doctype html><html><body>' +
        '<script src="data:text/javascript,console.log(1)"></script>' +
        '<img src="data:image/svg+xml;base64,PHN2Zy8+">' +
        '</body></html>';
    writeFileSync(file, html);

    const result = externalizeAllureMain(file);

    t.same(result.files, [], 'only base64 JavaScript is extracted');
    t.equal(readFileSync(file, 'utf8'), html, 'the page is untouched');

    rmSync(dir, {recursive: true, force: true});
});

test('the shared bundle is configured through the environment', async t => {
    const names = ['BLONG_ALLURE_MAIN_URL', 'BLONG_ALLURE_MAIN_DIR'] as const;
    const previous = names.map(name => process.env[name]);
    t.teardown(() => {
        names.forEach((name, index) => {
            const value = previous[index];
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        });
    });
    const root = '/work/repository';

    delete process.env['BLONG_ALLURE_MAIN_URL'];
    delete process.env['BLONG_ALLURE_MAIN_DIR'];
    t.same(configuredBundle(root), {}, 'unset means a file beside the page');

    process.env['BLONG_ALLURE_MAIN_DIR'] = '_assets/allure';
    t.same(configuredBundle(root), {}, 'a directory without a URL is not used');

    process.env['BLONG_ALLURE_MAIN_URL'] = '  ../../../_assets/allure  ';
    t.same(
        configuredBundle(root),
        {url: '../../../_assets/allure', dir: join(root, '_assets', 'allure')},
        'the URL is trimmed and the directory resolved against the repository root',
    );
});
