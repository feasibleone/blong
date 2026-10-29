import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, relative, resolve} from 'node:path';
import t from 'tap';

import {
    type FileChange,
    type PrimitiveContext,
    type PrimitiveHost,
    capitalize,
    plan,
    templateTokens,
} from './engine.ts';
import {REALM_TEMPLATE_ROOT} from './operation.ts';
import {getPrimitive} from './primitives/index.ts';

/**
 * The `seed` primitive, on its own.
 *
 * The end-to-end suite only notices a missing RBAC grant when the whole fixture
 * boots: it arrives as a 403 in an unrelated browser test, which is how a
 * `meta/dbTest` → `meta/db` move of the template's RBAC seed went unnoticed.
 * These assertions pin the placement rule instead — the rows of a seed live in
 * `meta/db` or `meta/dbTest` according to its kind, while the grant the entity
 * needs is always the realm's PRODUCTION RBAC seed, because the roles and
 * capabilities it edits are production provisioning.
 */

const host: PrimitiveHost = {
    existsSync,
    readFileSync: (path, options) =>
        readFileSync(path, options as {encoding: BufferEncoding} | undefined),
    writeFileSync: (path, data) => {
        mkdirSync(dirname(path), {recursive: true});
        writeFileSync(path, data);
    },
    mkdirSync: path => mkdirSync(path, {recursive: true}),
    scan: async (...path: string[]) => readdir(join(...path), {withFileTypes: true}),
    statSync: path => ({size: statSync(path).size}),
    join,
    resolve,
    dirname,
    basename,
    relative,
};

const RBAC_SEED = 'meta/db/accessAuthorizationMerge.yaml';

/** The realm's own object, the one the template's RBAC seed already grants. */
const TEMPLATE_OBJECT = 'item';

/** The object a later `add` scaffolds on top of it. */
const ADDED_OBJECT = 'gadget';
const ADDED_NAME = capitalize(ADDED_OBJECT);

const PROD_SEED = `meta/db/test${ADDED_NAME}Merge.yaml`;
const TEST_SEED = `meta/dbTest/test${ADDED_NAME}Merge.yaml`;

const context: PrimitiveContext = {
    subject: 'test',
    object: TEMPLATE_OBJECT,
    kind: 'prod',
    platform: 'server',
    params: {predicate: 'add'},
};

/** A realm as `realm add` leaves it: the template's RBAC seed, tokens substituted. */
function scaffoldedRealm(): string {
    const root = mkdtempSync(join(tmpdir(), 'kukum-seed-'));
    const template = readFileSync(join(REALM_TEMPLATE_ROOT, RBAC_SEED), 'utf8');
    const realm = templateTokens(template, context.subject, context.object);
    mkdirSync(join(root, 'meta', 'db'), {recursive: true});
    writeFileSync(join(root, RBAC_SEED), realm);
    return root;
}

const descriptor = getPrimitive('seed');

const planned = (root: string, kind: string): FileChange[] => {
    if (!descriptor) throw new Error("the 'seed' primitive is not registered");
    return plan(host, descriptor, {root, context: {...context, object: ADDED_OBJECT, kind}});
};

/** The one planned change at `path`, or a failure naming what was planned instead. */
const change = (changes: FileChange[], path: string): FileChange => {
    const found = changes.find(entry => entry.path === path);
    if (!found)
        throw new Error(`no '${path}' planned; got ${changes.map(entry => entry.path).join(', ')}`);
    return found;
};

/** The comma-separated value of one indented YAML key. */
const list = (source: string, key: string): string[] =>
    (new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm').exec(source)?.[1] ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

t.test('a production seed keeps its rows in meta/db', t => {
    const root = scaffoldedRealm();
    try {
        const changes = planned(root, 'prod');
        t.same(
            changes.map(entry => entry.path),
            [PROD_SEED, RBAC_SEED],
            'the rows are a production seed beside the RBAC grant',
        );
        t.match(change(changes, PROD_SEED).content, /gadgetId: 101/, 'the seed carries rows');
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});

t.test('a test seed keeps its rows in meta/dbTest, and its grant is not a test seed', t => {
    const root = scaffoldedRealm();
    try {
        const changes = planned(root, 'test');
        t.same(
            changes.map(entry => entry.path),
            [TEST_SEED, RBAC_SEED],
            'the rows are a test seed, the grant is not',
        );
        t.notOk(
            changes.some(entry => entry.path.startsWith('meta/dbTest/access')),
            'nothing is written under meta/dbTest, where only dev and ci dispatch it',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});

for (const kind of ['prod', 'test']) {
    t.test(`the grant reaches the production RBAC seed: ${kind}`, t => {
        const root = scaffoldedRealm();
        try {
            const merged = change(planned(root, kind), RBAC_SEED).content;
            t.same(
                list(merged, 'testManage').slice(-5),
                [
                    'testGadgetAdd',
                    'testGadgetFind',
                    'testGadgetGet',
                    'testGadgetEdit',
                    'testGadgetRemove',
                ],
                'Manage gains every action',
            );
            t.same(
                list(merged, 'testMaintain').slice(-4),
                ['testGadgetAdd', 'testGadgetFind', 'testGadgetGet', 'testGadgetEdit'],
                'Maintain gains read + edit but not remove',
            );
            t.same(
                list(merged, 'testView').slice(-2),
                ['testGadgetFind', 'testGadgetGet'],
                'View gains the reads only',
            );
            t.same(
                list(merged, 'testManage').slice(0, 5),
                ['testItemAdd', 'testItemFind', 'testItemGet', 'testItemEdit', 'testItemRemove'],
                "the template object's actions survive — the grant appends, never replaces",
            );
        } finally {
            rmSync(root, {recursive: true, force: true});
        }
        t.end();
    });
}

t.test('the grant is idempotent, so re-adding an entity changes nothing', t => {
    const root = scaffoldedRealm();
    try {
        const first = change(planned(root, 'test'), RBAC_SEED);
        host.writeFileSync(first.absolute, first.content);
        t.equal(
            change(planned(root, 'prod'), RBAC_SEED).action,
            'unchanged',
            'the second add leaves the RBAC seed alone',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});

t.test('a realm without the production RBAC seed says so instead of staying silent', t => {
    const root = mkdtempSync(join(tmpdir(), 'kukum-seed-'));
    try {
        const changes = planned(root, 'test');
        t.same(
            changes.map(entry => entry.path),
            [TEST_SEED],
            'only the rows are planned',
        );
        const notices = change(changes, TEST_SEED).notices ?? [];
        t.match(
            notices.join('\n'),
            /no meta\/db\/accessAuthorizationMerge\.yaml/,
            'the missing grant is reported as a notice, not swallowed',
        );
        t.match(
            notices.join('\n'),
            /every gateway call will be denied/,
            'the notice names the consequence',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});
