import {type IMeta, library} from '@feasibleone/blong';

import {renderTable} from './aclMatrix.ts';

/**
 * `aclFixture` — assert the records an ACL matrix is built from (group
 * `test.acl.matrix` and its two siblings).
 *
 * The matrix step asserts an *outcome* (a cell is allowed or denied); this step
 * asserts the *cause*: the fixture table names each record and the triples that
 * lead to the effective access, and every column is one predicate —
 * `belongsTo`, `isPartOf`, `hasRole`, `hasScope`, `hasCapability` — plus
 * `clientId` for a service account.  `party.fixture.get` reads those back
 * from the graph, so a table is a claim about the fixture that fails when the
 * seed stops matching it.
 *
 * A cell holds a comma-separated list of names and states every target of that
 * subject and predicate: an edge the fixture does not name is a mismatch, not an
 * extra.  `—` (or `·`, or an empty cell) asserts that there are none.
 *
 * Three shapes share the one engine:
 *
 *   - a **records** table — first column is a record (a tree, when the rows are
 *     indented), with `kind` mapping it to its type alias and one column per
 *     predicate;
 *   - a **rules** table — the columns `effect`, `actions` and `target`, where
 *     `actions` may name a capability instead of listing the actions it holds;
 *   - anything in between, because a column is only read when its header is a
 *     predicate or one of those names.
 */

/** The `kind` column → the type alias a row asserts. */
const KIND_TYPE: Record<string, string> = {
    org: 'party.organization',
    unit: 'party.unit',
    person: 'party.person',
    consent: 'party.consent',
    user: 'access.user',
    role: 'access.role',
    bundle: 'access.role',
    app: 'gateway.application',
};

/** Columns read as graph predicates, plus `hasAction` for the capability shorthand. */
const PREDICATE_COLUMNS = ['belongsTo', 'isPartOf', 'hasRole', 'hasScope', 'hasCapability'];

/** Predicates fetched from the graph — the columns above, plus the capability's actions. */
const FETCH_PREDICATES = [...PREDICATE_COLUMNS, 'hasAction'];

/** Leading box-drawing tree glyphs and padding — stripped to get a row's name. */
const TREE_PREFIX = /^[\s│├└─┬┴┼|+-]+/;

/** A cell that asserts nothing at all. */
const EMPTY = new Set(['', '·', '.', '-', '—']);

export interface IAclFixtureParams {
    /** The Gherkin Data Table: a header row, then one row per record. */
    table: string[][];
    /** Name of the table in the failure report (default `the ACL fixture`). */
    title?: string;
    /** Harness user that reads the graph (default `testAdmin`). */
    admin?: string;
    /** Shared password of the fixture users (default `testPassword`). */
    password?: string;
}

export interface IAclFixtureResult {
    /** One line per cell whose content did not match the graph. */
    mismatches: string[];
    ok: boolean;
    /** The table redrawn with what the graph holds, plus the mismatches. */
    render(): string;
}

/** What `party.fixture.get` returns — see that handler for the fields. */
interface IAclFixtureFacts {
    resources: Array<{resourceName: string; typeAlias: string}>;
    facts: Array<{
        subject: string;
        predicate: string;
        object: string;
        objectType: string;
    }>;
    rules: Array<{
        principal: string;
        principalType: string;
        action: string;
        target: string;
        targetKind: string;
        effect: string;
    }>;
    clientIds: Array<{resourceName: string; clientId: string | null}>;
}

/** A cell's expected names, `—` and blanks meaning none. */
function namesOf(cell: string | undefined): string[] {
    const value = String(cell ?? '').trim();
    if (EMPTY.has(value)) return [];
    return value
        .split(',')
        .map(name => name.trim())
        .filter(name => name !== '');
}

/** The row label with its tree glyphs stripped. */
function labelOf(cell: string): string {
    return cell.replace(TREE_PREFIX, '').trim();
}

/** A set compared and reported as a sorted list. */
function sameSet(expected: string[], actual: string[]): boolean {
    if (expected.length !== actual.length) return false;
    const left = [...expected].sort();
    const right = [...actual].sort();
    return left.every((value, index) => value === right[index]);
}

/** Render a name list for the report — an empty list is the "none" marker. */
function show(names: string[]): string {
    return names.length ? [...names].sort().join(', ') : '—';
}

/** The two methods the fixture read needs, resolved from the runtime handler proxy. */
interface IAclFixtureCaller {
    loginTokenCreate: (
        params: {username?: string; password?: string},
        $meta: IMeta,
    ) => Promise<unknown>;
    partyFixtureGet: (
        params: {names: string[]; predicates?: string[]},
        $meta: IMeta,
    ) => Promise<IAclFixtureFacts>;
}

/**
 * The graph answers, cached for the process.  A feature's Background asserts the
 * same tables before every scenario, and one read costs a login plus four
 * queries — a measurable slice of the suite's budget.  A run does not change the
 * fixture the matrix is built from, so a cached answer is the same answer.
 */
const fixtureCache = new Map<string, IAclFixtureFacts>();

/**
 * Read the fixture, signing in as the harness user only when the session is not
 * its own: the session belongs to whatever the previous step signed in as (a
 * matrix row leaves its viewer behind), so a read may be refused before the
 * harness user is established.  A refusal costs a round trip and the login that
 * follows it, where assuming the session would cost a login before every table.
 */
async function readFixture(
    names: string[],
    params: IAclFixtureParams,
    $meta: IMeta,
    call: IAclFixtureCaller,
): Promise<IAclFixtureFacts> {
    const key = JSON.stringify({names: [...names].sort(), predicates: FETCH_PREDICATES});
    const cached = fixtureCache.get(key);
    if (cached) return cached;

    const read = () =>
        call.partyFixtureGet(
            {names, predicates: FETCH_PREDICATES},
            // A refusal is the expected first answer when the session is not the
            // harness user's; the login below is the reaction to it.
            {...$meta, expect: 'gateway.notAllowed'},
        );
    let fixture: IAclFixtureFacts;
    try {
        fixture = await read();
    } catch {
        await call.loginTokenCreate(
            {username: params.admin ?? 'testAdmin', password: params.password ?? 'testPassword'},
            $meta,
        );
        fixture = await read();
    }
    fixtureCache.set(key, fixture);
    return fixture;
}

export default library(({handler}) => {
    // Lib functions receive no handler proxy, so the one method the fixture
    // reads is resolved here, once, at layer assembly.
    const call = handler as unknown as IAclFixtureCaller;

    return async function aclFixture(
        params: IAclFixtureParams,
        $meta: IMeta,
    ): Promise<IAclFixtureResult> {
        const table = params.table.filter(row => row.some(cell => String(cell).trim() !== ''));
        if (table.length < 2) {
            throw new Error('The ACL fixture table needs a header row and at least one record row');
        }
        const title = params.title ?? 'the ACL fixture';
        const [headerRow, ...bodyRows] = table;
        const headers = headerRow.map(cell => String(cell).trim());
        if (headers.length < 2) {
            throw new Error('The ACL fixture table needs a record column besides its first');
        }
        // A Gherkin row may omit its trailing empty cells — pad so a report and a
        // marker can address every column.
        const rows = bodyRows.map(row =>
            headers.map((_, index) => String(row[index] ?? '').trim()),
        );
        const notesAt = headers.findIndex(header => header.toLowerCase() === 'notes');
        const effectAt = headers.indexOf('effect');
        const targetAt = headers.indexOf('target');
        const actionsAt = headers.indexOf('actions');
        const isRules = effectAt > 0 && targetAt > 0 && actionsAt > 0;

        // Every name the table mentions is fetched, so the graph answers are
        // complete for the subjects asserted.
        const names = new Set<string>();
        for (const row of rows) {
            names.add(labelOf(row[0]));
            for (let i = 1; i < row.length; i++) {
                if (i === notesAt) continue;
                for (const name of namesOf(row[i])) if (name !== '*') names.add(name);
            }
        }
        const fixture = await readFixture([...names], params, $meta, call);

        const bySubject = new Map<string, Map<string, string[]>>();
        for (const fact of fixture.facts) {
            const predicates = bySubject.get(fact.subject) ?? new Map<string, string[]>();
            predicates.set(fact.predicate, [
                ...(predicates.get(fact.predicate) ?? []),
                fact.object,
            ]);
            bySubject.set(fact.subject, predicates);
        }
        const clientIdOf = new Map(
            fixture.clientIds.map(entry => [entry.resourceName, entry.clientId]),
        );
        // Rules are keyed by principal, effect and target — a rule holds one
        // action, so the cell lists them all in one group.
        const rulesOf = new Map<string, string[]>();
        for (const rule of fixture.rules) {
            const key = `${rule.principal}|${rule.effect}|${rule.target}`;
            rulesOf.set(key, [...(rulesOf.get(key) ?? []), rule.action]);
        }

        const mismatches: string[] = [];
        const rendered: string[][] = rows.map(row => [...row]);

        const fail = (
            rowIndex: number,
            column: number,
            subject: string,
            header: string,
            expected: string[],
            actual: string[],
        ): void => {
            mismatches.push(
                `${subject} · ${header}: expected ${show(expected)}, got ${show(actual)}`,
            );
            rendered[rowIndex][column] = `${show(expected)}≠${show(actual)}`;
        };

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const subject = labelOf(row[0]);
            const kind = namesOf(row[headers.indexOf('kind')]).at(0);
            if (kind !== undefined) {
                const typeAlias = KIND_TYPE[kind];
                if (!typeAlias) {
                    mismatches.push(`${subject} · kind: "${kind}" is not a known kind`);
                } else if (
                    !fixture.resources.some(
                        resource =>
                            resource.resourceName === subject && resource.typeAlias === typeAlias,
                    )
                ) {
                    mismatches.push(`${subject} · kind: no ${typeAlias} named "${subject}"`);
                }
            }
            for (let c = 1; c < headers.length; c++) {
                if (c === notesAt || isRules) continue;
                const header = headers[c];
                const expected = namesOf(row[c]);
                if (PREDICATE_COLUMNS.includes(header)) {
                    const actual = bySubject.get(subject)?.get(header) ?? [];
                    if (!sameSet(expected, actual)) fail(r, c, subject, header, expected, actual);
                } else if (header === 'clientId') {
                    const actual = clientIdOf.get(subject) ?? null;
                    if (!sameSet(expected, actual ? [actual] : [])) {
                        fail(r, c, subject, header, expected, actual ? [actual] : []);
                    }
                }
            }
        }

        // A rules row: the three columns together name one group of rules.
        if (isRules) {
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                const subject = labelOf(row[0]);
                const effect = namesOf(row[effectAt]).at(0) ?? '';
                const target = row[targetAt];
                // An `actions` cell may name a capability whose actions the rule
                // covers, or list the actions themselves.
                const cell = namesOf(row[actionsAt]);
                const capability =
                    cell.length === 1 ? bySubject.get(cell[0])?.get('hasAction') : undefined;
                const expected = capability ?? cell;
                const actual = rulesOf.get(`${subject}|${effect}|${target}`) ?? [];
                if (!sameSet(expected, actual)) {
                    fail(r, actionsAt, subject, `${effect} ${target}`, expected, actual);
                }
            }
        }

        const render = (): string => {
            const report = [
                `${title} — ${mismatches.length} mismatch${mismatches.length === 1 ? '' : 'es'}`,
                '',
                renderTable(headers, rendered),
            ];
            if (mismatches.length) {
                report.push('', 'Mismatches:');
                for (const mismatch of mismatches) report.push(`  ${mismatch}`);
            }
            return report.join('\n');
        };

        return {mismatches, ok: mismatches.length === 0, render};
    };
});
