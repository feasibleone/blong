/**
 * Tests for the well-known layer table — the single source of truth for which folders are layers and
 * which intent activates them.
 *
 * What is pinned here is the *semantics* a reader relies on, not the contents: an intent only ever
 * activates what it names, and `release` names nothing. A deployed process is activated by the flags
 * the plan wrote into its container args (`--<realm>.<layer>`, D-406), never by the intent it runs —
 * so no entry may be keyed by `release`, or a deployment would activate every layer a realm has
 * rather than the split it was deployed for.
 */
import {test} from 'tap';

import {isWellKnownLayer, WELL_KNOWN_LAYER_NAMES, WELL_KNOWN_LAYERS} from './layers.ts';

/** The intents that select which blocks of a config exist (`core/blong-gogo/src/load.ts`). */
const KNOWN_INTENTS: readonly string[] = [
    'default',
    'dev',
    'integration',
    'playwright',
    'ci',
    'release',
    'upgrade',
    'cli',
    'k8s',
    'microservice',
];

test('the table is the list of names, and answers for each of them', t => {
    t.equal(
        WELL_KNOWN_LAYER_NAMES.length,
        Object.keys(WELL_KNOWN_LAYERS).length,
        'one name per entry',
    );
    for (const name of WELL_KNOWN_LAYER_NAMES) {
        t.equal(isWellKnownLayer(name), true, `${name} is a layer`);
        t.equal(name.startsWith('/'), false, `${name} is relative`);
    }
    t.equal(
        isWellKnownLayer('orchestrators'),
        false,
        'a name that is not in the table is no layer',
    );
    t.end();
});

test('an activation names only intents, and release is never one of them', t => {
    for (const [name, platforms] of Object.entries(WELL_KNOWN_LAYERS)) {
        for (const [platform, activation] of Object.entries(platforms)) {
            t.ok(activation, `${name} declares an activation for ${platform}`);
            for (const intent of Object.keys(activation as Record<string, unknown>)) {
                t.ok(KNOWN_INTENTS.includes(intent), `${name}/${platform} names a known intent`);
                t.not(intent, 'release', `${name}/${platform} is not activated by release`);
            }
        }
    }
    t.end();
});
