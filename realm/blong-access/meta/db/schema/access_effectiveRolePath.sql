CREATE OR REPLACE VIEW access_effectiveRolePath AS -- Direct role assignment: user → role
    --   core.triple: user hasRole role
SELECT t1.subjectId AS originId,
    t1.objectId AS destinationId,
    'access.effectiveRole' AS pathType,
    1 AS pathDepth
FROM core_triple t1
WHERE t1.predicateName = 'hasRole'
UNION
-- Org-unit-inherited role: user → unit → role
--   core.triple: user belongsTo unit
--   core.triple: unit hasRole role
SELECT t1.subjectId AS originId,
    t2.objectId AS destinationId,
    'access.effectiveRole' AS pathType,
    2 AS pathDepth
FROM core_triple t1
    JOIN core_triple t2 ON t2.subjectId = t1.objectId
    AND t2.predicateName = 'hasRole'
WHERE t1.predicateName = 'belongsTo';