import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
    mergePendingTranslations,
    mergeSeed,
    parseSeed,
    pendingDir,
    serializeSeed,
    startTranslationRun,
    writePendingReport,
    writeSeedFile,
} from './translate.js';

let dir = '';

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blong-i18n-'));
});

afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
    delete process.env['BLONG_TRANSLATION_RUN'];
});

const seed = (name: string) => join(dir, 'meta', 'db', name);

describe('seed text', () => {
    it('parses one pair per line, with the first = as the separator', () => {
        const text = [
            'languageCode: bg',
            'label: |',
            '    Save=Запази',
            '    Url=a=b',
            '    Todo=',
        ].join('\n');
        const entries = parseSeed(text, 'label');
        expect(entries.get('Save')).toBe('Запази');
        expect(entries.get('Url')).toBe('a=b');
        expect(entries.get('Todo')).toBe('');
    });

    it('adds only what is missing, keeps an empty line and sorts', () => {
        const current = ['languageCode: bg', 'label: |', '    Save=Запази', '    Browse='].join(
            '\n',
        );
        const merged = mergeSeed(current, 'label', ['Save', 'Edit', 'Browse', 'Add'], 'bg');
        expect(merged.added).toBe(2);
        expect(merged.kept).toBe(2);
        const entries = parseSeed(merged.text, 'label');
        expect(entries.get('Save')).toBe('Запази');
        expect(entries.get('Browse')).toBe('');
        expect(entries.get('Edit')).toBe('');
        // Sorted, so a diff is stable.
        expect([...entries.keys()]).toEqual(['Add', 'Browse', 'Edit', 'Save']);
    });

    it('serialises a new file with its language', () => {
        const text = serializeSeed('bg', 'label', new Map([['Save', 'Запази']]));
        expect(text).toBe('languageCode: bg\nlabel: |\n    Save=Запази\n');
    });
});

describe('seed file', () => {
    it('is created once and then left alone', () => {
        const file = seed('bg-coreLabelSeed.yaml');
        expect(writeSeedFile(file, 'label', ['Save', 'Edit'], 'bg').added).toBe(2);
        expect(writeSeedFile(file, 'label', ['Save', 'Edit', 'Add'], 'bg')).toEqual({
            added: 1,
            kept: 2,
        });
        expect(readFileSync(file, 'utf8')).toContain('    Add=\n');
    });
});

describe('pending reports', () => {
    it('merges every report of the run, then clears them', () => {
        const options = {
            language: 'bg',
            label: seed('bg-coreLabelSeed.yaml'),
            translation: seed('bg-coreTranslationSeed.yaml'),
        };
        startTranslationRun(options);
        writePendingReport(options, {language: 'bg', missing: ['Save', 'Edit']});
        writePendingReport(options, {language: 'bg', missing: ['Save', 'Browse']});
        expect(pendingDir(options)).toContain('.pending');

        const summary = mergePendingTranslations(options);
        expect(summary).toEqual({label: 3, translation: 0, runs: 2});
        const entries = parseSeed(readFileSync(options.label, 'utf8'), 'label');
        expect([...entries.keys()]).toEqual(['Browse', 'Edit', 'Save']);
    });

    it('writes nothing when a spec configured no seed', () => {
        startTranslationRun({language: 'bg', label: seed('bg-coreLabelSeed.yaml')});
        expect(writePendingReport({language: 'bg'}, {missing: ['Save']})).toBeUndefined();
        expect(mergePendingTranslations({language: 'bg'})).toEqual({
            label: 0,
            translation: 0,
            runs: 0,
        });
    });

    it('writes nothing outside a harvest run, even with a seed declared', () => {
        const options = {language: 'bg', label: seed('bg-coreLabelSeed.yaml')};
        delete process.env['BLONG_TRANSLATION_RUN'];
        expect(writePendingReport(options, {missing: ['Save']})).toBeUndefined();
    });

    it('keeps a report of resource names separate from label keys', () => {
        const options = {
            language: 'bg',
            label: seed('bg-coreLabelSeed.yaml'),
            translation: seed('bg-coreTranslationSeed.yaml'),
        };
        startTranslationRun(options);
        writePendingReport(options, {
            missing: ['Save'],
            missingResources: ['sport.sport|Athletics'],
        });

        const summary = mergePendingTranslations(options);
        expect(summary.label).toBe(1);
        expect(summary.translation).toBe(1);
        expect(readFileSync(options.translation, 'utf8')).toContain('    sport.sport|Athletics=\n');
    });

    it('drops a run directory nobody claimed', () => {
        const options = {language: 'bg', label: seed('bg-coreLabelSeed.yaml')};
        const stale = join(dir, 'meta', 'db', '.pending', 'abandoned');
        mkdirSync(stale, {recursive: true});
        writeFileSync(join(stale, 'x.json'), '{"missing":[]}');
        startTranslationRun(options);
        expect(mergePendingTranslations(options).runs).toBe(0);
    });
});
