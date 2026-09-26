/**
 * Where a failing test stands in the base branch's recent history.
 *
 * The runners keep Allure history (`<pkg>/.ci-report/history.jsonl`, rebuilt into the
 * committed `.github/history.jsonl`), one record per run holding every test of that
 * run with its status. `blong-dev ci-report` reads the *base branch's* copy, so the
 * question a pull-request reader actually asks can be answered:
 *
 * - `new` — this test was green (or did not run) in every recent base run, so this
 *   branch is the likely cause;
 * - `recurring` — it failed the last time base ran it, i.e. main is already red here
 *   and the failure is not this branch's;
 * - `intermittent` — it failed earlier but not the last time, i.e. it is one of ours
 *   that flakes.
 *
 * This is a *hint*, not a verdict: it is matched by name (the history records carry
 * `fullName`, the report carries the runner's own test name) because nothing joins
 * the two by id. The two do not even agree on a separator — the browser leg writes
 * `file › suite › title` and the handler leg writes `realm.collection.group.step` —
 * so the match normalises both into a segment list and compares suffixes. A name that
 * maps to more than one test in the same run is reported as unknown rather than
 * guessed at, and a test with no history at all — a runner that does not report to
 * Allure — is unknown too.
 */

import type {HistoryRecord} from './history.ts';

/** Field used to attribute a record to a package. */
const HISTORY_TAG = 'package';

/** How many recent base-branch runs count as "recent". */
export const PROVENANCE_RUNS = 5;

/** Both separators the producers use, in one pattern. */
const SEPARATORS = /\s*›\s*|\./;

/** How a normalised segment list is joined, so two conventions share one key space. */
const KEY_SEPARATOR = '\u0000';

export type FailureProvenance = 'new' | 'recurring' | 'intermittent';

export interface IFailureHistory {
    kind: FailureProvenance;
    /** Runs that contained this test, newest last, within the recent window. */
    runs: number;
    /** How many of those runs it failed or broke in. */
    failedRuns: number;
}

export interface IProvenanceIndex {
    /**
     * Status of a test in the recent base-branch runs, or `null` when unknown.
     *
     * `fullName`, when the runner had one, is tried first: it is the exact string the
     * history was written from, where the bare name is all a reader sees in the report.
     */
    lookup(pkg: string, testName: string, fullName?: string): IFailureHistory | null;
}

interface ISeen {
    run: number;
    status: string;
}

interface IPackageHistory {
    /** Records seen for this package, i.e. how many runs the history holds. */
    runs: number;
    /** Test name (or any suffix of it) → its statuses, in run order. */
    tests: Map<string, ISeen[]>;
    /** Names that mapped to more than one test in one run, so they mean nothing. */
    ambiguous: Set<string>;
}

function isFailure(status: string): boolean {
    return status === 'failed' || status === 'broken';
}

/**
 * Every suffix of a name, longest first, with both separators normalised away.
 *
 * `file › group › test` and `realm.collection.group.test` both become
 * `group ⋯ test` and `test`, which is what lets a handler-test name match the dotted
 * history of its group while a browser test matches the path it was written under.
 */
function suffixes(name: string): string[] {
    const segments = name
        .split(SEPARATORS)
        .map(segment => segment.trim())
        .filter(segment => segment !== '');
    const out: string[] = [];
    for (let start = 0; start < segments.length; start += 1) {
        out.push(segments.slice(start).join(KEY_SEPARATOR));
    }
    return out;
}

function readTests(record: HistoryRecord): Array<{key: string; id: string; status: string}> {
    const results = record['testResults'];
    if (!results || typeof results !== 'object') return [];
    const out: Array<{key: string; id: string; status: string}> = [];
    for (const [uuid, value] of Object.entries(results as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const test = value as Record<string, unknown>;
        const fullName = typeof test['fullName'] === 'string' ? test['fullName'] : '';
        const name = typeof test['name'] === 'string' ? test['name'] : '';
        const status = typeof test['status'] === 'string' ? test['status'] : 'unknown';
        const id = typeof test['id'] === 'string' ? test['id'] : uuid;
        for (const key of suffixes(fullName || name)) out.push({key, id, status});
        // A record whose full name is not the report's own spelling still has to be
        // reachable by the bare name, which is all a reader sees in the report.
        if (name !== '' && name !== fullName) {
            for (const key of suffixes(name)) out.push({key, id, status});
        }
    }
    return out;
}

/**
 * Index the history records for lookups by test name.
 *
 * Records are expected in run order (oldest first), which is how the committed file
 * is written: each package's own records keep the order Allure appended them in.
 */
export function indexProvenance(
    records: readonly HistoryRecord[],
    limit: number = PROVENANCE_RUNS,
): IProvenanceIndex {
    const packages = new Map<string, IPackageHistory>();

    for (const record of records) {
        const pkg = record[HISTORY_TAG];
        if (typeof pkg !== 'string' || pkg === '') continue;
        let history = packages.get(pkg);
        if (!history) {
            history = {runs: 0, tests: new Map(), ambiguous: new Set()};
            packages.set(pkg, history);
        }
        const run = history.runs;
        history.runs += 1;

        // One run can contain several tests under one name (two files of a package
        // with the same test title). Where that happens the name means nothing, so it
        // is struck out for good and any occurrences recorded for it so far are
        // dropped: a partial history would answer with the wrong test's status, and
        // "unknown" is the honest answer for a name that is not unique. A key claimed
        // twice by the *same* test (its full name and its bare name are both indexed)
        // is one sighting, not two.
        const claimed = new Map<string, string>();
        const conflicts = new Set<string>();
        for (const {key, id, status} of readTests(record)) {
            const previous = claimed.get(key);
            if (previous !== undefined) {
                if (previous !== id) conflicts.add(key);
                continue;
            }
            claimed.set(key, id);
            const seen = history.tests.get(key) ?? [];
            seen.push({run, status});
            history.tests.set(key, seen);
        }
        for (const key of conflicts) {
            history.ambiguous.add(key);
            history.tests.delete(key);
        }
    }

    const classify = (pkg: string, testName: string): IFailureHistory | null => {
        const history = packages.get(pkg);
        if (!history || history.ambiguous.has(testName)) return null;
        const recent = history.tests
            .get(testName)
            ?.filter(seen => seen.run >= history.runs - limit);
        if (!recent || recent.length === 0) return null;
        const failedRuns = recent.filter(seen => isFailure(seen.status)).length;
        const last = recent[recent.length - 1]!;
        return {
            kind: isFailure(last.status) ? 'recurring' : failedRuns > 0 ? 'intermittent' : 'new',
            runs: recent.length,
            failedRuns,
        };
    };

    return {
        lookup(pkg, testName, fullName) {
            // Longest suffix first, and the producer's full name before the report's
            // own: a report name that carries its group path (`e2e flow › addGadget`)
            // matches the full path in history before the bare leaf name, which
            // several tests of one package can share.
            for (const candidate of suffixes(fullName ?? '')) {
                const found = classify(pkg, candidate);
                if (found) return found;
            }
            for (const candidate of suffixes(testName)) {
                const found = classify(pkg, candidate);
                if (found) return found;
            }
            return null;
        },
    };
}
