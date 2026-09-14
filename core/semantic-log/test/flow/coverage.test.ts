/**
 * The requirement coverage contract.
 *
 * Every v1 requirement (R1–R21) is mapped to the test that demonstrates it, and
 * this file **checks the mapping rather than asserting it**: the named file has to
 * exist and has to contain the named test. A contract that only claimed the paths
 * were non-empty would pass against a demonstration that had been deleted or
 * renamed, which is the same "a mechanism that can never fire" defect the rest of
 * this plan exists to catch — a register that cannot notice its own staleness.
 *
 * What it does **not** prove is that the test demonstrates the requirement well;
 * that is a review question, not a mechanical one. What it proves is that every
 * requirement has a live demonstration and that adding R22 without mapping it fails
 * here instead of being discovered by a reader.
 *
 * Paths are package-root-relative, and the test name is matched as a literal
 * substring of the file, so a renamed test is a failure rather than a silent gap.
 */

import {readFile} from 'node:fs/promises';

import t from 'tap';

/** One demonstration: a test file, and the test inside it. */
type Demonstration = string;

/**
 * Requirement → the demonstrations that satisfy it. A requirement may be
 * demonstrated more than once (a unit test pinning the mechanism and a flow test
 * pinning it end to end), which is why the value is a list.
 *
 * The flow fixtures are cited wherever they demonstrate a requirement end to end,
 * because that is the evidence the fixtures exist to provide: a flow test is a real
 * run over HTTP whose assertions are made against records read back out of each
 * participant's own cache, not against objects a test built.
 */
const COVERAGE: Readonly<Record<string, readonly Demonstration[]>> = {
    R1: ['src/fingerprint.test.ts::two executions differing only in variable values share a fingerprint'],
    R2: ['src/stack.test.ts::line and column numbers never affect the result'],
    R3: [
        'src/fingerprint.test.ts::serialization is a deterministic prefixed string',
        'src/service/provider.test.ts::hashEmbedding is deterministic, bounded and dimension-stable',
    ],
    R4: [
        'src/service/registry.test.ts::the registry is the durable artifact: it answers without records (PRD R4)',
        'src/service/persistence.test.ts',
    ],
    R5: ['src/service/provider.test.ts::the offline provider needs no configuration and no network'],
    R6: [
        'src/service/detectors.test.ts::a steady rate produces nothing, a surge produces rate-shift (PRD R6b)',
        'test/flow/faults.test.ts::F2: a retry burst is one template at a rate-shift, not 41 new templates (PRD R6b, R12)',
        'test/flow/faults.test.ts::F3: a reworded message is a template of its own, which is what makes a deploy visible (R6c, R14)',
        'test/flow/faults.test.ts::F1: a refused transfer is attributed to the payee and the hub releases what it withheld',
    ],
    R7: [
        'test/flow/happy.test.ts::each participant is identifiable and the causal chain is walkable from the records (PRD R7)',
        'test/flow/happy.test.ts::the records alone reconstruct the chain through the service (PRD R7 acceptance)',
    ],
    R8: ['src/service/digest.test.ts::reading from a cursor returns only newer entries (PRD R8)'],
    R9: [
        'test/flow/faults.test.ts::F4: a stalled payee is attributed to the payee and its wait is recorded',
        'test/flow/participant.test.ts::phase steps the bound flow and refuses to step outside one',
    ],
    R10: [
        'test/flow/faults.test.ts::F1: a refused transfer is attributed to the payee and the hub releases what it withheld',
        'test/flow/guards.test.ts::withheld detail belongs to the execution that withheld it, not to the next failure (PRD R10)',
    ],
    R11: [
        'test/flow/faults.test.ts::F5: a declined rate stops the chain at the provider and nothing settles',
        'test/flow/happy.test.ts::the inter-scheme flow crosses the proxy in one execution and one trace (PRD R9, R11)',
    ],
    R12: ['test/flow/faults.test.ts::F2: a retry burst is one template at a rate-shift, not 41 new templates (PRD R6b, R12)'],
    R13: ['src/service/ingest.test.ts::exemplars are retained in full for the first N events, then counted only (PRD R13)'],
    R14: [
        'src/service/search.test.ts::search ranks templates by similarity to the query vector (PRD R14)',
        'src/service/search.test.ts::deploy diff reports templates added and removed, and counts the rest (PRD R14)',
    ],
    R15: [
        'src/service/incidents.test.ts::anomalies across services on one trace become ONE incident (PRD R15)',
        'test/flow/happy.test.ts::an inter-scheme refusal is attributed to the far end and releases the origin hold (PRD R15, R10)',
    ],
    R16: ['src/service/facets.test.ts::every facet is a projection of the same stored entry'],
    R17: ['test/parity.test.ts::every matrix row is accounted for'],
    R18: [
        'test/flow/happy.test.ts::the flow runs with no cluster service anywhere (PRD R18 acceptance)',
        'test/offline.test.ts::a default logger emits with no service configured',
    ],
    R19: [
        'src/render.test.ts::references are appended and are dereferenceable',
        'test/flow/happy.test.ts::references are locally minted and carry a template-id prefix (PRD R19, R12)',
    ],
    R20: ['src/render.test.ts::the header carries the listed details in a greppable order'],
    R21: ['test/spawn.test.ts::a linked invocation resolves a record whose writer has exited'],
};

/**
 * Every requirement the PRD states for v1. Kept as a literal so the count is a claim.
 *
 * Sorted the way `Object.keys().sort()` sorts, because the comparison below is a set
 * comparison and comparing a numeric ordering against a lexicographic one fails for
 * reasons that have nothing to do with coverage.
 */
const REQUIREMENTS = Array.from({length: 21}, (_, index) => `R${index + 1}`).sort();

t.test('every v1 requirement is mapped to at least one demonstration', t => {
    t.same(Object.keys(COVERAGE).sort(), REQUIREMENTS, 'R1–R21 are all accounted for, and nothing else is');
    for (const requirement of REQUIREMENTS) {
        const demonstrations = COVERAGE[requirement] ?? [];
        t.ok(demonstrations.length > 0, `${requirement} has a demonstration`);
        for (const demonstration of demonstrations) {
            const [file, test] = demonstration.split('::');
            t.ok(file.length > 0, `${requirement} -> ${file} names a file`);
            t.ok(
                test === undefined || test.length > 0,
                `${requirement} -> ${file} names a test rather than an empty claim`,
            );
        }
    }
    t.end();
});

t.test('every demonstration exists, and the named test is in the file it names', async t => {
    // The half that makes this a contract rather than a comment: a demonstration
    // that has been deleted, moved or renamed fails here. Deleting the assertion in
    // one of the cited tests would not fail this one — the name would still be
    // present — which is why the mapping is reviewed and not only checked.
    for (const requirement of REQUIREMENTS) {
        for (const demonstration of COVERAGE[requirement] ?? []) {
            const [file, test] = demonstration.split('::');
            const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8').catch(error => {
                t.fail(`${requirement} -> ${file}: ${String(error)}`);
                return undefined;
            });
            if (source === undefined || test === undefined) {
                continue;
            }
            t.ok(
                source.includes(test),
                `${requirement} -> ${file} contains the test it cites ("${test}")`,
            );
        }
    }
});
