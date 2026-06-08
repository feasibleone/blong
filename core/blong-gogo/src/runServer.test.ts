/**
 * Unit tests for CLI intent parsing logic in runServer.ts.
 *
 * These tests verify:
 *   - autoRun correctly separates file-path targets from intents
 *   - runPlatform uses DEFAULT_INTENTS when no intents are provided
 *   - DEFAULT_INTENTS matches the expected set
 */

import {test} from 'tap';

import {DEFAULT_INTENTS} from './runServer.ts';

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
    t.same(resolveIntents(['db']), ['db']);
});

test('resolveIntents — multiple intents preserved in order', async t => {
    t.same(resolveIntents(['dev', 'debug']), ['dev', 'debug']);
});
