CREATE PROCEDURE access_pathRefresh() BEGIN -- Clear existing flattened paths for the access realm.
DELETE FROM core_path
WHERE pathType IN ('access.effectiveAction', 'access.effectiveRole');
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
END