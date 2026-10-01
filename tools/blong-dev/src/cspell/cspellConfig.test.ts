/**
 * Unit tests for the cspell config reader/writer (cspell/cspellConfig.ts).
 *
 * The behaviour worth pinning is the part a hand edit gets wrong: where a new
 * word lands, that a glob arrives quoted, that a moved item keeps its comment, and
 * that a document nobody changed renders byte for byte.
 */

import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {
    addValues,
    analyseValues,
    compareWords,
    CSPELL_CONFIG_FILE,
    isCspellSection,
    loadCspellConfig,
    removeValues,
    renderCspellConfig,
    sectionState,
    sectionValues,
    sortSection,
    writeCspellConfig,
} from './cspellConfig.ts';

const FIXTURE = [
    'version: "0.2"',
    'language: en-GB',
    'words:',
    '  - blong',
    '  - Acropora',
    '  - bullnose',
    '  - Béziers',
    '  # belongs to the next word',
    '  - zustand',
    'ignorePaths:',
    '  - package-lock.json',
    '  - "**/*.json"',
    '',
].join('\n');

/** Write a config to a throwaway directory. */
function fixture(text: string): {file: string; dispose: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-cspell-'));
    const file = join(dir, CSPELL_CONFIG_FILE);
    writeFileSync(file, text);
    return {file, dispose: () => rmSync(dir, {recursive: true, force: true})};
}

test('isCspellSection knows the maintained sections', t => {
    t.equal(isCspellSection('words'), true, 'words');
    t.equal(isCspellSection('ignorePaths'), true, 'ignorePaths');
    t.equal(isCspellSection('flagWords'), false, 'flagWords is not maintained');
    t.end();
});

test('compareWords orders case-insensitively, by code unit', t => {
    t.ok(compareWords('bge', 'binhex') < 0, 'g sorts before i');
    t.ok(compareWords('bullnose', 'Béziers') < 0, 'é sorts above u, so Béziers is last');
    t.equal(compareWords('semlog', 'Semlog'), 0, 'case alone is not a difference');
    t.equal(compareWords('blong', 'blong'), 0, 'equal');
    t.end();
});

test('analyseValues finds the first break and the duplicates', t => {
    const sorted = analyseValues(['a', 'b', 'C']);
    t.equal(sorted.sorted, true, 'a, b, C is sorted');
    t.same(sorted.duplicates, [], 'no duplicates');

    const broken = analyseValues(['a', 'c', 'b']);
    t.equal(broken.sorted, false, 'a, c, b is not sorted');
    t.same(broken.outOfOrder, {index: 2, value: 'b', before: 'c'}, 'the break names both words');

    const repeated = analyseValues(['a', 'b', 'a', 'b']);
    t.same(repeated.duplicates, ['a', 'b'], 'each repeated value is listed once');
    t.end();
});

test('sectionValues reads the list and leaves other keys alone', t => {
    const {file, dispose} = fixture(FIXTURE);
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    t.same(
        sectionValues(doc, 'words'),
        ['blong', 'Acropora', 'bullnose', 'Béziers', 'zustand'],
        'words in file order',
    );
    t.same(sectionValues(doc, 'ignorePaths'), ['package-lock.json', '**/*.json'], 'ignorePaths');
    t.equal(sectionValues(doc, 'flagWords'), undefined, 'a section that is not there');
    t.end();
});

test('sectionState reports a list that is not sorted', t => {
    const {file, dispose} = fixture(FIXTURE);
    t.teardown(dispose);
    const state = sectionState(loadCspellConfig(file), 'words');
    t.equal(state?.sorted, false, 'blong before Acropora is not sorted');
    t.equal(state?.outOfOrder?.value, 'Acropora', 'the word that is out of place');
    t.equal(state?.values.length, 5, 'entries are reported');
    t.end();
});

test('loadCspellConfig refuses a file that does not parse', t => {
    const {file, dispose} = fixture('words: [unclosed\n');
    t.teardown(dispose);
    t.throws(() => loadCspellConfig(file), /blong-dev-cspell-/, 'names the file');
    t.end();
});

test('an untouched document renders byte for byte', t => {
    const {file, dispose} = fixture(FIXTURE);
    t.teardown(dispose);
    t.equal(renderCspellConfig(loadCspellConfig(file)), FIXTURE, 'comments and quoting survive');
    t.end();
});

test('writeCspellConfig writes only when the bytes change', t => {
    const {file, dispose} = fixture(FIXTURE);
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    t.equal(writeCspellConfig(file, doc), false, 'a no-op run reports no change');
    addValues(doc, 'words', ['kukum']);
    t.equal(writeCspellConfig(file, doc), true, 'a real edit reports a change');
    t.end();
});

test('addValues inserts in sorted position and keeps the list sorted', t => {
    const {file, dispose} = fixture(FIXTURE);
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    const result = addValues(doc, 'words', ['kukum', 'Acropora', 'kukum']);
    t.same(result.added, ['kukum'], 'only the word that was missing is added');
    t.same(result.present, ['Acropora'], 'the word already there is reported');
    t.equal(result.entries, 6, 'the count follows');
    t.same(
        sectionValues(doc, 'words'),
        ['Acropora', 'blong', 'bullnose', 'Béziers', 'kukum', 'zustand'],
        'the list is sorted after the insert',
    );
    t.end();
});

test('addValues quotes a value YAML would otherwise misread', t => {
    const {file, dispose} = fixture('words:\n  - blong\n');
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    addValues(doc, 'words', ['**/dist/**', 'true']);
    t.equal(
        renderCspellConfig(doc),
        'words:\n  - "**/dist/**"\n  - blong\n  - "true"\n',
        'a glob and a boolean-looking word arrive quoted',
    );
    t.end();
});

test('addValues creates a section that is not there yet', t => {
    const {file, dispose} = fixture('version: "0.2"\n');
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    const result = addValues(doc, 'words', ['blong']);
    t.same(result.added, ['blong'], 'the word is added');
    t.equal(renderCspellConfig(doc), 'version: "0.2"\nwords:\n  - blong\n', 'the section is added');
    t.end();
});

test('addValues refuses a key that is not a list', t => {
    const {file, dispose} = fixture('words: not-a-list\n');
    t.teardown(dispose);
    t.throws(
        () => addValues(loadCspellConfig(file), 'words', ['blong']),
        /"words" is not a list/,
        'the config is reported rather than overwritten',
    );
    t.end();
});

test('removeValues removes and reports what was not there', t => {
    const {file, dispose} = fixture(FIXTURE);
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    const result = removeValues(doc, 'words', ['Acropora', 'notthere']);
    t.same(result.removed, ['Acropora'], 'the word is removed');
    t.same(result.missing, ['notthere'], 'the word that is absent is reported');
    t.equal(result.entries, 4, 'the count follows');
    t.same(
        sectionValues(doc, 'words'),
        ['blong', 'bullnose', 'Béziers', 'zustand'],
        'the order is untouched',
    );
    t.end();
});

test('removeValues on an absent section removes nothing', t => {
    const {file, dispose} = fixture('version: "0.2"\n');
    t.teardown(dispose);
    const result = removeValues(loadCspellConfig(file), 'words', ['blong']);
    t.same(result.removed, [], 'nothing removed');
    t.same(result.missing, ['blong'], 'the request is reported as missing');
    t.equal(result.entries, 0, 'no section, no entries');
    t.end();
});

test('sortSection orders the list and moves a comment with its item', t => {
    const {file, dispose} = fixture(
        ['words:', '  - bullnose', '  # belongs to blong', '  - blong', ''].join('\n'),
    );
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    const result = sortSection(doc, 'words');
    t.equal(result?.reordered, true, 'the list was out of order');
    t.same(result?.removed, [], 'nothing was dropped');
    t.equal(
        renderCspellConfig(doc),
        ['words:', '  # belongs to blong', '  - blong', '  - bullnose', ''].join('\n'),
        'the comment travels with the word it describes',
    );
    t.end();
});

test('sortSection leaves an absent section alone', t => {
    const {file, dispose} = fixture('version: "0.2"\n');
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    t.equal(sortSection(doc, 'words'), undefined, 'nothing to order');
    t.equal(renderCspellConfig(doc), 'version: "0.2"\n', 'and nothing is created');
    t.end();
});

test('sortSection drops exact duplicates and is idempotent', t => {
    const {file, dispose} = fixture(
        ['words:', '  - bullnose', '  - blong', '  - blong', ''].join('\n'),
    );
    t.teardown(dispose);
    const doc = loadCspellConfig(file);
    const result = sortSection(doc, 'words');
    t.same(result?.removed, ['blong'], 'the repeat is reported');
    t.equal(result?.entries, 2, 'the count follows');
    const once = renderCspellConfig(doc);
    const again = sortSection(doc, 'words');
    t.equal(again?.reordered, false, 'a second sort has nothing to do');
    t.equal(renderCspellConfig(doc), once, 'and changes nothing');
    t.end();
});
