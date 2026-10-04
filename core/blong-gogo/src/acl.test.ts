/**
 * The ACL filter's SQL and its bindings, for the table shape that has no scope
 * edges to resolve.
 *
 * `aclCheckSql` assembles the expression strictly in placeholder order, and the
 * fragments that inline a *column* reference — a correlated list filter — bind
 * nothing for it.  A table declared `acl: {...}` with neither `scopes` nor
 * `selfScope` reaches the branch that does exactly that, so the two paths are
 * pinned here: a stray binding throws before any verdict is reached, which no
 * integration test can distinguish from a refusal.
 */
import t from 'tap';
import {aclCheckSql, type IResolvedAclConfig} from './adapter/server/acl.ts';

const cfg: IResolvedAclConfig = {
    table: 'access_acl',
    actionTable: 'access_action',
    rolePathType: 'access.effectiveRole',
    scopePathType: 'access.effectiveScope',
    unitPredicate: 'belongsTo',
    scopePredicate: 'hasScope',
};

/** Every expression carries as many bindings as it carries placeholders. */
const balanced = (sql: string, bindings: unknown[]): boolean =>
    sql.split('?').length - 1 === bindings.length;

t.test('a table with no scope edges builds a balanced list filter', t => {
    const check = aclCheckSql({
        cfg,
        actorId: Buffer.alloc(16, 1),
        actionId: Buffer.alloc(16, 2),
        // A correlated filter: the record is addressed by its column, not bound.
        recordRef: 'party_consent.consentId',
        mode: 'explicit',
    });
    t.ok(balanced(check.sql, check.bindings), 'placeholders match bindings');
    t.match(
        check.sql,
        /a\.targetKind = 'record' AND a\.targetId = party_consent\.consentId/,
        'the record is matched through its column',
    );
    t.notMatch(check.sql, /targetId = \?/, 'and not bound');
    t.end();
});

t.test('a single-record check still binds the record id', t => {
    const check = aclCheckSql({
        cfg,
        actorId: Buffer.alloc(16, 1),
        actionId: Buffer.alloc(16, 2),
        recordRef: '?',
        recordId: Buffer.alloc(16, 3),
        mode: 'explicit',
    });
    t.ok(balanced(check.sql, check.bindings), 'placeholders match bindings');
    t.match(check.sql, /targetId = \?/, 'the record is bound');
    t.end();
});

t.test('a table that declares no scope edges is still guarded by scopes it is given', t => {
    // `add` hands the scope set in explicitly, so an explicit-mode table with no
    // `scopes` of its own is not exempt from the target test.
    const check = aclCheckSql({
        cfg,
        actorId: Buffer.alloc(16, 1),
        actionId: Buffer.alloc(16, 2),
        scopeIds: [Buffer.alloc(16, 4)],
        mode: 'explicit',
    });
    t.ok(balanced(check.sql, check.bindings), 'placeholders match bindings');
    t.match(check.sql, /targetKind = 'scope' AND a\.targetId IN \(/, 'a scope rule can match');
    t.end();
});
