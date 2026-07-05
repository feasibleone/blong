CREATE PROCEDURE access_pathRefresh() BEGIN -- Clear existing flattened effective-action paths for the access realm.
DELETE FROM core_path
WHERE pathType = 'access.effectiveAction';
-- Rebuild from the view that computes the user→action hierarchy via
-- direct roles and org-unit-inherited roles.
INSERT INTO core_path (originId, destinationId, pathType, pathDepth)
SELECT originId,
    destinationId,
    pathType,
    pathDepth
FROM access_effectiveActionPath;
END