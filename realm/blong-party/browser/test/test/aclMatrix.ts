import {type IMeta, library} from '@feasibleone/blong';

/**
 * `aclMatrix` — the ACL-specific half of the matrix test (group `test.acl.matrix`).
 *
 * Reads a Gherkin Data Table (see `browser/test/feature/aclMatrix.ts`), signs in
 * as the harness user to resolve the subject persons, then signs in as each
 * viewer and probes `party.person.get` **through the gateway** — RBAC lives in
 * the gateway's preHandler, so an in-process call would answer 404 for a caller
 * RBAC would refuse with 403.
 *
 * The verdict of a cell is its HTTP result:
 *
 *   - allowed   the call returns the record
 *   - denied    `acl.notFound` (404) — the record-level ACL hides the row
 *   - forbidden 403 — RBAC refuses the action before the handler runs
 *
 * The helper only reports; the step asserts `ok` and shows `render()` on failure,
 * so a red run prints the matrix (tree, icons, notes) exactly as written, with
 * each mismatch marked `expected≠actual`.
 */

/** A verdict the probe can produce. */
export type AclOutcome = 'allowed' | 'denied' | 'forbidden';

/** One icon per verdict — the alphabet the feature file is written in. */
const OUTCOME_ICON: Record<AclOutcome, string> = {
    allowed: '✅',
    denied: '❌',
    forbidden: '🚫',
};

/** A cell that asserts nothing: `·` (not applicable) or an empty cell. */
const SKIP = new Set(['', '·', '.', '-']);

/**
 * What a probe is allowed to answer instead of a record.  The cell is the
 * assertion, so a denial is the expected outcome for a `❌` or `🚫` cell, and
 * declaring it keeps the run's error stream for the failures nobody asked for
 * (a mismatch is asserted on, not logged).
 */
const EXPECTED_DENIALS = ['acl.notFound', 'gateway.notAllowed'];

/** Leading box-drawing tree glyphs and padding — stripped to get a row's name. */
const TREE_PREFIX = /^[\s│├└─┬┴┼|+-]+/;

export interface IAclMatrixParams {
    /** The Gherkin Data Table: a header row, then one row per viewer. */
    table: string[][];
    /** Header of the trailing free-text column (default `notes`). */
    notesHeader?: string;
    /** Probe method the cells stand for, reported in the redraw (default `party.person.get`). */
    probe?: string;
    /** Shared password of the fixture users (default `testPassword`). */
    password?: string;
    /**
     * Viewer label → the username it signs in with, when they differ.  The
     * fixture convention is a user named after its person in lower case (`Amy`
     * the person, `amy` the user), which is what the default applies.
     */
    usernames?: Record<string, string>;
    /** Harness user that resolves the subject ids (default `testAdmin`). */
    admin?: string;
    /** Header of the tree column (default `viewer`). */
    viewerHeader?: string;
    /**
     * Viewers that authenticate with the OAuth `client_credentials` grant instead
     * of a password — a service account per row, keyed by its tree label.  When
     * set, only rows whose label is a key here are viewers; the others are
     * structure, so a tree of organization and unit nodes needs no blank rows.
     */
    principals?: Record<string, IAclMatrixPrincipal>;
    /** The records the columns name, and how they are probed (default: persons). */
    target?: IAclMatrixTarget;
}

/** A service-account viewer — the client id it authenticates with, and its secret. */
export interface IAclMatrixPrincipal {
    clientId: string;
    /** Falls back to the shared `password` param. */
    secret?: string;
}

/**
 * What a matrix measures a viewer against.  The default probes persons, which is
 * what the first matrix does; units and organizations are the same shape with a
 * different find, id column and probe.
 */
export interface IAclMatrixTarget {
    /** Find handler that resolves each column header to a record id. */
    find:
        | 'partyPersonFind'
        | 'partyUnitFind'
        | 'partyOrganizationFind'
        | 'partyConsentFind'
        | 'accessAclFind';
    /**
     * Entity column the header names, sent as the find's `filterBy`.
     *
     * Omitted when the name is a *joined* field the table does not hold —
     * `access.acl` belongs to no `core.resource` of its own, so it names its
     * target, and that name is resolved by `nameColumn` instead.
     */
    filterColumn?: 'lastName' | 'unitName' | 'legalName' | 'consentName';
    /** Field of the returned rows the header names, matched in code (see `filterColumn`). */
    nameColumn?: 'targetName';
    /** Id column the find returns. */
    idColumn: 'personId' | 'unitId' | 'organizationId' | 'consentId' | 'aclId';
    /** Single-record probe called for each cell. */
    get:
        | 'partyPersonGet'
        | 'partyUnitGet'
        | 'partyOrganizationGet'
        | 'partyConsentGet'
        | 'accessAclGet';
}

/** Persons — the columns of the person and service-account matrices. */
export const ACL_TARGET_PERSONS: IAclMatrixTarget = {
    find: 'partyPersonFind',
    filterColumn: 'lastName',
    idColumn: 'personId',
    get: 'partyPersonGet',
};

/** Units — a unit's scope set is the organization it belongs to (plus that organization's ancestors). */
export const ACL_TARGET_UNITS: IAclMatrixTarget = {
    find: 'partyUnitFind',
    filterColumn: 'unitName',
    idColumn: 'unitId',
    get: 'partyUnitGet',
};

/** Organizations — an organization is its own scope (`selfScope`). */
export const ACL_TARGET_ORGANIZATIONS: IAclMatrixTarget = {
    find: 'partyOrganizationFind',
    filterColumn: 'legalName',
    idColumn: 'organizationId',
    get: 'partyOrganizationGet',
};

/**
 * Consents — the explicit-mode matrix.  `party.consent` declares
 * `acl: {mode: 'explicit'}`: no scope grant reaches it, so a cell is allowed only
 * where a rule names the record (or every record), and denied otherwise.
 */
export const ACL_TARGET_CONSENTS: IAclMatrixTarget = {
    find: 'partyConsentFind',
    filterColumn: 'consentName',
    idColumn: 'consentId',
    get: 'partyConsentGet',
};

/**
 * The explicit rules themselves — `access.acl` is the one table this suite seeds
 * records into that declares no `acl` block, so a rule that hides a person is
 * readable by everyone, the hidden person included.  A column is the *record a
 * rule targets* (`targetName`), which is what makes the contrast exact: the row
 * above it may not see Ben, and this table hands out the rule that denies him.
 */
export const ACL_TARGET_RULES: IAclMatrixTarget = {
    find: 'accessAclFind',
    nameColumn: 'targetName',
    idColumn: 'aclId',
    get: 'accessAclGet',
};

/** The default target, and what the first matrix probes. */
const DEFAULT_TARGET: IAclMatrixTarget = ACL_TARGET_PERSONS;

/**
 * Frame a table so a failure can be read where it happened.
 *
 * Every row is bounded by pipes and every cell padded to its column's width, so a
 * marked cell (`expected≠actual`) widens its own column instead of shifting the
 * rest of the row, and the row and column a mismatch names are the ones the eye
 * lands on.  Both tables render through it — the access matrix and the fixture
 * tables (`aclFixture` imports it) — so a red run looks the same either way, which
 * is what the diagnostics test (group `test.acl.diagnostics`) holds in place.
 */
export function renderTable(header: string[], rows: string[][]): string {
    const widths = header.map((cell, column) =>
        Math.max(cell.length, ...rows.map(row => (row[column] ?? '').length)),
    );
    const line = (cells: string[]): string =>
        `| ${cells.map((cell, column) => (cell ?? '').padEnd(widths[column])).join(' | ')} |`;
    return [line(header), ...rows.map(line)].join('\n');
}

export interface IAclMatrixCell {
    subject: string;
    /** The icon written in the feature file. */
    expected: string;
    /** What the probe produced (`skipped` for `·` / blank). */
    actual: AclOutcome | 'skipped' | 'error';
    ok: boolean;
    /** The error detail when the probe failed unexpectedly. */
    detail?: string;
}

export interface IAclMatrixRow {
    /** The first-column label with its tree glyphs stripped. */
    label: string;
    /** The raw first-column cell, glyphs included. */
    tree: string;
    /** A viewer row (its label is a subject) or a structural one. */
    viewer: boolean;
    note?: string;
    cells: IAclMatrixCell[];
}

export interface IAclMatrixResult {
    /** Column headers — the subject persons, in order. */
    subjects: string[];
    rows: IAclMatrixRow[];
    /** One line per cell whose verdict did not match its icon. */
    mismatches: string[];
    ok: boolean;
    /** The matrix redrawn with its icons, a legend and the mismatches. */
    render(): string;
}

/** A `find` result is a plain array through the adapter — tolerate the wrapped shape too. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const items = (result as {items?: unknown} | undefined)?.items;
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
}

/** The HTTP status a handler-proxy error carries (JSON-RPC codec or MLE path). */
function httpStatus(error: unknown): number | undefined {
    const e = error as Record<string, unknown>;
    return (
        ((e.res as Record<string, unknown>)?.statusCode as number | undefined) ??
        (e.statusCode as number | undefined) ??
        ((e.params as Record<string, unknown>)?.code as number | undefined)
    );
}

/** Turn a probe failure into the verdict it stands for. */
function classify(error: unknown): {outcome: AclOutcome | 'error'; detail?: string} {
    const status = httpStatus(error);
    const type = (error as {type?: string}).type;
    // The record-level ACL hides a read as not-found, so a 404 is a denial, not
    // a missing row (every subject is seeded).
    if (type === 'acl.notFound' || status === 404) return {outcome: 'denied'};
    // RBAC refuses the action before the handler runs; the ACL denies a write
    // (never a read) with the same status.
    if (status === 403 || type === 'acl.denied' || type === 'acl.notPermitted') {
        return {outcome: 'forbidden'};
    }
    const message = (error as Error)?.message ?? String(error);
    return {
        outcome: 'error',
        detail: `${type ?? 'error'}${status ? ` (HTTP ${status})` : ''}: ${message}`,
    };
}

/** The verdict an icon stands for, or `undefined` for an icon the matrix cannot read. */
function outcomeOf(icon: string): AclOutcome | undefined {
    return (Object.keys(OUTCOME_ICON) as AclOutcome[]).find(key => OUTCOME_ICON[key] === icon);
}

export default library(({handler}) => {
    // Lib functions receive no handler proxy, so the three methods the matrix
    // calls are resolved here, once, at layer assembly.
    const call = handler as unknown as {
        loginTokenCreate: (
            params: {
                grantType?: 'password' | 'client_credentials';
                username?: string;
                password?: string;
                clientId?: string;
                clientSecret?: string;
            },
            $meta: IMeta,
        ) => Promise<unknown>;
        partyPersonFind: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyPersonGet: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyUnitFind: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyUnitGet: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyOrganizationFind: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyOrganizationGet: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyConsentFind: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        partyConsentGet: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        accessAclFind: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
        accessAclGet: (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;
    };

    return async function aclMatrix(
        params: IAclMatrixParams,
        $meta: IMeta,
    ): Promise<IAclMatrixResult> {
        const table = params.table.filter(row => row.some(cell => String(cell).trim() !== ''));
        if (table.length < 2) {
            throw new Error('The ACL matrix needs a header row and at least one viewer row');
        }
        const [headerRow, ...bodyRows] = table;
        if (headerRow.length < 2) {
            throw new Error('The ACL matrix needs at least one subject column');
        }

        const notesHeader = (params.notesHeader ?? 'notes').toLowerCase();
        const hasNotes = (headerRow.at(-1) ?? '').trim().toLowerCase() === notesHeader;
        const subjects = headerRow.slice(1, hasNotes ? -1 : undefined).map(cell => cell.trim());
        const password = params.password ?? 'testPassword';
        const target = params.target ?? DEFAULT_TARGET;
        const probe = params.probe ?? 'party.person.get';
        const principals = params.principals;

        // Resolve the subject names to record ids as the harness user.  The ids
        // are needed because the probe addresses a record by key, and a system
        // call would not authenticate over the gateway.
        await call.loginTokenCreate({username: params.admin ?? 'testAdmin', password}, $meta);
        const subjectIds = new Map<string, string>();
        for (const subject of subjects) {
            const filterColumn = target.filterColumn;
            const found = await call[target.find](
                filterColumn
                    ? {filterBy: {[filterColumn]: subject}, paging: {pageNumber: 1, pageSize: 5}}
                    : {paging: {pageNumber: 1, pageSize: 500}},
                $meta,
            );
            const rows = rowsOf(found);
            // A column named by a field the table cannot filter on (a joined
            // name) is matched here, on the rows the find returned.
            const record = filterColumn
                ? rows[0]
                : rows.find(row => String(row[target.nameColumn ?? ''] ?? '') === subject);
            const subjectId = record?.[target.idColumn];
            if (typeof subjectId !== 'string') {
                throw new Error(
                    filterColumn
                        ? `The ACL matrix fixture has no ${target.idColumn} named "${subject}"`
                        : `No ${target.find} row has ${target.nameColumn} "${subject}"`,
                );
            }
            subjectIds.set(subject, subjectId);
        }

        // Walk the table.  A row whose tree label is a subject is a viewer; a row
        // whose label is not (an organization or unit) is structure and asserts
        // nothing — its cells are the `·` marker.
        const signedIn = new Set<string>();
        const rows: IAclMatrixRow[] = [];
        const mismatches: string[] = [];

        for (const row of bodyRows) {
            const tree = String(row[0] ?? '').trim();
            const label = tree.replace(TREE_PREFIX, '').trim();
            const note = hasNotes ? String(row.at(-1) ?? '').trim() : undefined;
            // With service accounts the viewers are exactly the declared
            // principals — a tree of organization and unit nodes has no
            // structural rows.  Otherwise a viewer is a row named like a subject.
            const viewer = principals ? Object.hasOwn(principals, label) : subjects.includes(label);
            const cells: IAclMatrixCell[] = [];

            if (viewer) {
                // One session serves the row: signing in replaces the client's
                // token, so the viewer is re-established once per row.
                if (!signedIn.has(label)) {
                    const principal = principals?.[label];
                    await call.loginTokenCreate(
                        principal
                            ? {
                                  grantType: 'client_credentials',
                                  clientId: principal.clientId,
                                  clientSecret: principal.secret ?? password,
                              }
                            : {
                                  username: params.usernames?.[label] ?? label.toLowerCase(),
                                  password,
                              },
                        $meta,
                    );
                    signedIn.add(label);
                }
                // The probes of one row are independent reads on the same session, so
                // they overlap: a matrix is hundreds of round trips and serialising
                // them was most of this suite's runtime (the application matrix alone
                // measured 80 of 149 seconds).  Each answer is collected by its column
                // index, so the redrawn table and the mismatch list keep the order the
                // feature file declares whatever order the answers arrive in.
                const probes = subjects.map(async (subject, i) => {
                    const expected = String(row[i + 1] ?? '').trim();
                    if (SKIP.has(expected)) {
                        return {
                            cell: {
                                subject,
                                expected,
                                actual: 'skipped',
                                ok: true,
                            } as IAclMatrixCell,
                            mismatch: undefined,
                        };
                    }
                    let actual: AclOutcome | 'error';
                    let detail: string | undefined;
                    try {
                        await call[target.get](
                            {[target.idColumn]: subjectIds.get(subject)},
                            {...$meta, expect: EXPECTED_DENIALS},
                        );
                        actual = 'allowed';
                    } catch (error) {
                        ({outcome: actual, detail} = classify(error));
                    }
                    const ok = outcomeOf(expected) === actual;
                    const got = actual === 'error' ? detail : OUTCOME_ICON[actual as AclOutcome];
                    return {
                        cell: {subject, expected, actual, ok, detail} as IAclMatrixCell,
                        mismatch: ok
                            ? undefined
                            : `${label} → ${subject}: expected ${expected}, got ${got}`,
                    };
                });
                for (const probe of await Promise.all(probes)) {
                    cells.push(probe.cell);
                    if (probe.mismatch) mismatches.push(probe.mismatch);
                }
            }

            rows.push({label, tree, viewer, note, cells});
        }

        const render = (): string => {
            const header = [
                params.viewerHeader ?? 'viewer',
                ...subjects,
                ...(hasNotes ? ['notes'] : []),
            ];
            const table = renderTable(
                header,
                rows.map(row => {
                    const cells = row.viewer
                        ? row.cells.map(cell => {
                              if (cell.ok) return cell.expected || '·';
                              const got =
                                  cell.actual === 'error'
                                      ? '?'
                                      : OUTCOME_ICON[cell.actual as AclOutcome];
                              return `${cell.expected}≠${got}`;
                          })
                        : subjects.map(() => '·');
                    const parts = [row.tree, ...cells];
                    if (hasNotes) parts.push(row.note ?? '');
                    return parts;
                }),
            );
            const legend = `${OUTCOME_ICON.allowed} allowed  ${OUTCOME_ICON.denied} denied  ${OUTCOME_ICON.forbidden} forbidden  · not applicable`;
            const report = [
                `${probe} access matrix — ${mismatches.length} mismatch${
                    mismatches.length === 1 ? '' : 'es'
                }`,
                '',
                table,
                '',
                legend,
            ];
            if (mismatches.length) {
                report.push('', 'Mismatches:');
                for (const mismatch of mismatches) report.push(`  ${mismatch}`);
            }
            return report.join('\n');
        };

        return {subjects, rows, mismatches, ok: mismatches.length === 0, render};
    };
});
