CREATE OR REPLACE VIEW access_effectiveActionPath AS -- Direct role assignment: user → role → capability → action
    --   core.triple: user hasRole role
    --   core.triple: role hasCapability capability
    --   core.triple: capability hasAction action
SELECT t1.subjectId AS originId,
    t3.objectId AS destinationId,
    'access.effectiveAction' AS pathType,
    3 AS pathDepth
FROM core_triple t1
    JOIN core_triple t2 ON t2.subjectId = t1.objectId
    AND t2.predicateName = 'hasCapability'
    JOIN core_triple t3 ON t3.subjectId = t2.objectId
    AND t3.predicateName = 'hasAction'
WHERE t1.predicateName = 'hasRole'
UNION
-- Org-unit-inherited role: user → orgUnit → role → capability → action
--   core.triple: user belongsTo orgUnit
--   core.triple: orgUnit hasRole role
--   core.triple: role hasCapability capability
--   core.triple: capability hasAction action
SELECT t1.subjectId AS originId,
    t4.objectId AS destinationId,
    'access.effectiveAction' AS pathType,
    4 AS pathDepth
FROM core_triple t1
    JOIN core_triple t2 ON t2.subjectId = t1.objectId
    AND t2.predicateName = 'hasRole'
    JOIN core_triple t3 ON t3.subjectId = t2.objectId
    AND t3.predicateName = 'hasCapability'
    JOIN core_triple t4 ON t4.subjectId = t3.objectId
    AND t4.predicateName = 'hasAction'
WHERE t1.predicateName = 'belongsTo';