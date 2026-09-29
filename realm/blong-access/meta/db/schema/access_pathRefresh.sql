CREATE PROCEDURE access_pathRefresh() BEGIN -- Serializes rebuilds across processes, and is where a rebuild publishes what it
-- covers.  The upsert takes an exclusive lock on the row for the rest of the
-- caller's transaction, so two rebuilds cannot interleave their DELETE and
-- INSERT ... SELECT over `core_path` and collide on its primary key
-- (originId, destinationId, pathType).  Called without a transaction — as the
-- older callers do — the lock ends with the statement and this is a plain
-- write of the coverage below.
INSERT INTO core_counter (counterName, counterValue)
VALUES ('access_pathRefresh.covered', 0) ON DUPLICATE KEY
UPDATE counterValue = counterValue;
-- The generation counts every write that skipped its own rebuild, and a writer
-- bumps it inside the transaction that writes its edges — so reading it here
-- means every edge it counts is already committed, and the rebuild below sees
-- them.  A write that commits while this runs bumps the generation after this
-- read: it stays uncovered, whoever checks next rebuilds again, and no update
-- is dropped.
SELECT COALESCE(counterValue, 0) INTO @generation
FROM core_counter
WHERE counterName = 'access_pathRefresh.generation';
-- Clear existing flattened paths for the access realm.
DELETE FROM core_path
WHERE pathType IN (
        'access.effectiveAction',
        'access.effectiveRole',
        'access.effectiveScope'
    );
-- Rebuild effective-action paths from the view that computes the
-- user→action hierarchy via direct roles and org-unit-inherited roles.
INSERT INTO core_path (originId, destinationId, pathType, pathDepth)
SELECT originId,
    destinationId,
    pathType,
    pathDepth
FROM access_effectiveActionPath;
-- Rebuild effective-role paths from the view that computes the
-- user→role hierarchy via direct and org-unit-inherited role assignment.
INSERT INTO core_path (originId, destinationId, pathType, pathDepth)
SELECT originId,
    destinationId,
    pathType,
    pathDepth
FROM access_effectiveRolePath;
-- Rebuild scope-ancestor paths: node → ancestor through `isPartOf`
-- (child → parent), so a grant on a parent scope covers everything linked to
-- its descendants.  A node's own scope rows come from the record's declared
-- scope predicates, so only real ancestors are stored here.  The recursion is
-- cycle-guarded; duplicate routes collapse to the shortest distance.
INSERT INTO core_path (originId, destinationId, pathType, pathDepth) WITH RECURSIVE scopeAncestors (originId, destinationId, pathDepth) AS (
        SELECT t.subjectId,
            t.objectId,
            1
        FROM core_triple t
        WHERE t.predicateName = 'isPartOf'
        UNION ALL
        SELECT a.originId,
            t.objectId,
            a.pathDepth + 1
        FROM scopeAncestors a
            JOIN core_triple t ON t.subjectId = a.destinationId
            AND t.predicateName = 'isPartOf'
        WHERE a.pathDepth < 32
    )
SELECT originId,
    destinationId,
    'access.effectiveScope',
    MIN(pathDepth)
FROM scopeAncestors
GROUP BY originId,
    destinationId;
-- Publish what this rebuild covered: everything the generation counted before it
-- started is in the paths again.  `GREATEST` because coverage only grows — a
-- slower rebuild that started earlier must not pull it back.
UPDATE core_counter
SET counterValue = GREATEST(counterValue, @generation)
WHERE counterName = 'access_pathRefresh.covered';
END