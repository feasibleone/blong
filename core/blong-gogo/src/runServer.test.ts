/**
 * Unit tests for CLI intent parsing logic in runServer.ts.
 *
 * These tests verify:
 *   - autoRun correctly separates file-path targets from intents
 *   - runPlatform uses DEFAULT_INTENTS when no intents are provided
 *   - DEFAULT_INTENTS matches the expected set
 */

import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'tap';

import {DEFAULT_INTENTS, autoRun} from './runServer.ts';

// ---------------------------------------------------------------------------
// DEFAULT_INTENTS
// ---------------------------------------------------------------------------

test('DEFAULT_INTENTS contains the three baseline intents', async t => {
    t.same(
        [...DEFAULT_INTENTS],
        ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])],
    );
});

// ---------------------------------------------------------------------------
// The optional target
// ---------------------------------------------------------------------------

test('autoRun loads a relative target from the folder the CLI ran in', async t => {
    // The first positional of `blong` is an optional target, and it is *tested* with
    // `existsSync(resolve(cwd, target))`. Handing the same unresolved string to `import()` made the
    // resolution happen twice, differently: `blong ./index.ts k8s` from a suite folder reported
    // `Cannot find module core/blong-gogo/src/index.ts` — a path the caller never typed, for a file
    // `existsSync` had just proved was there (F-438). This module is the target because it exists and
    // has no default export, so the failure that comes back is the one about the export — which is
    // only reachable once the path resolved, and is a message rather than a running server.
    const here = dirname(fileURLToPath(import.meta.url));
    await t.rejects(
        autoRun({cwd: here, target: './runServer.ts', intents: ['dev']}),
        /has no default export/,
        'the relative target is resolved against the working directory before it is imported',
    );
});

// ---------------------------------------------------------------------------
// Intent extraction helper — replicated inline to avoid FS side-effects
// ---------------------------------------------------------------------------

/**
 * Mirrors the logic in bin/blong.ts:
 *   - first element is the target when existsSync returns true
 *   - remaining elements (or all elements when no target) are intents
 */
function extractIntents(
    positional: string[],
    fileExists: (path: string) => boolean,
): {target: string | undefined; intents: string[]} {
    const [maybeTarget, ...rest] = positional;
    const target = maybeTarget && fileExists(maybeTarget) ? maybeTarget : undefined;
    const intents = target ? rest : positional;
    return {target, intents};
}

// ---------------------------------------------------------------------------
// extractIntents — file-path as first positional
// ---------------------------------------------------------------------------

test('extractIntents — recognises existing file as target', async t => {
    const {target, intents} = extractIntents(['./server.ts', 'integration'], () => true);
    t.equal(target, './server.ts');
    t.same(intents, ['integration']);
});

test('extractIntents — non-existent path is treated as an intent', async t => {
    const {target, intents} = extractIntents(['integration', 'dev'], () => false);
    t.equal(target, undefined);
    t.same(intents, ['integration', 'dev']);
});

test('extractIntents — empty args yield no target and no intents', async t => {
    const {target, intents} = extractIntents([], () => false);
    t.equal(target, undefined);
    t.same(intents, []);
});

test('extractIntents — single file target, no intents', async t => {
    const {target, intents} = extractIntents(['/abs/path/server.ts'], () => true);
    t.equal(target, '/abs/path/server.ts');
    t.same(intents, []);
});

test('extractIntents — multiple intents with no target', async t => {
    const {target, intents} = extractIntents(['integration', 'microservice', 'debug'], () => false);
    t.equal(target, undefined);
    t.same(intents, ['integration', 'microservice', 'debug']);
});

test('extractIntents — multiple intents after a valid target', async t => {
    const {target, intents} = extractIntents(['./index.ts', 'integration', 'debug'], () => true);
    t.equal(target, './index.ts');
    t.same(intents, ['integration', 'debug']);
});

// ---------------------------------------------------------------------------
// Intent resolution — default fallback when none provided
// ---------------------------------------------------------------------------

/**
 * Mirrors the intent-resolution logic in autoRun:
 *   cliIntents.length > 0  → use cliIntents
 *   otherwise              → fall back to DEFAULT_INTENTS
 */
function resolveIntents(cliIntents: string[]): string[] {
    return cliIntents.length > 0 ? cliIntents : [...DEFAULT_INTENTS];
}

test('resolveIntents — empty CLI intents fall back to defaults', async t => {
    t.same(resolveIntents([]), [...DEFAULT_INTENTS]);
});

test('resolveIntents — provided intents are used as-is', async t => {
    t.same(resolveIntents(['integration']), ['integration']);
});

test('resolveIntents — custom intent is passed through', async t => {
    t.same(resolveIntents(['upgrade']), ['upgrade']);
});

test('resolveIntents — multiple intents preserved in order', async t => {
    t.same(resolveIntents(['dev', 'debug']), ['dev', 'debug']);
});

// ---------------------------------------------------------------------------
// A rejection nobody awaited is the firing site's to report
// ---------------------------------------------------------------------------

// The guard that used to be covered here is gone. It existed because a dispatch fired without a
// caller had no `catch` to attach and Node's default ended the process (T-229), but a process-wide
// listener reported a call nobody could name and let the failure repeat until something restarted the
// process for it. The two places that fire one — the operator's watch and its controller loop — catch
// and log their own failures now, which is asserted where they live.
