CREATE PROCEDURE access_pathRefresh() BEGIN -- Clear existing flattened paths for the access realm.
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
INSERT INTO core_path (originId, destinationId, pathType, pathDepth)
WITH RECURSIVE scopeAncestors (originId, destinationId, pathDepth) AS (
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
END