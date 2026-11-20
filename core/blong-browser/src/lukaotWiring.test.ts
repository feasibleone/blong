/**
 * The page's vocabulary is wired, not merely declared.
 *
 * `BrowserLog.signalFor` composes what the packages in the process contributed and every port's
 * attacher composes the same list first, so a realm's declaration reaches a handler and a component
 * alike — but only if the file is loaded and only if it loads before the layers that call it. None of
 * that is visible to the compiler, and a page that loses it does not fail: a call site written with
 * `?.` simply records nothing. These three assertions are the cheap stand-in (`@@D-920`).
 */

import {contributedVocabularies} from '@feasibleone/lukaot';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const realmRoot = dirname(here);

describe('the browser realm vocabulary', () => {
    it('contributes its names to the process when the layer loads', async () => {
        await import('../lukaot/signal.ts');
        const names = contributedVocabularies().flatMap(vocabulary =>
            Object.keys((vocabulary as {signal?: Record<string, unknown>}).signal ?? {}),
        );
        expect(names).toContain('browserLoginTokenMissing');
        expect(names).toContain('browserLoginCallFailed');
        expect(names).toContain('browserModelIncomplete');
    });

    it('lists the lukaot folder as a child, and before the layers that call it', () => {
        // The browser loader lists its layers explicitly — auto-discovery is server-only — so a folder
        // whose glob is missing is a folder that never loads.
        const source = readFileSync(join(realmRoot, 'browser.ts'), 'utf8');
        const listed = source.indexOf("'./lukaot/**/*.ts'");
        const orchestrator = source.indexOf("'./orchestrator/**/*.ts'");
        expect(listed, 'the glob names ./lukaot/**/*.ts').toBeGreaterThan(-1);
        expect(orchestrator, 'the orchestrator glob is still there').toBeGreaterThan(-1);
        expect(
            listed,
            'and comes before it, so a port sees the names when it attaches',
        ).toBeLessThan(orchestrator);
        expect(source).toContain("'./lukaot'");
    });

    it('declares the three names as log signals at warn', async () => {
        const {default: vocabulary} = await import('../lukaot/signal.ts');
        const signals = (vocabulary as {signal: Record<string, {kind: string; level: string}>})
            .signal;
        for (const name of Object.keys(signals))
            expect([name, signals[name]?.kind, signals[name]?.level]).toEqual([
                name,
                'log',
                'warn',
            ]);
    });
});
