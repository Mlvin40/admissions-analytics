MATCH (a:Applicant {key: $applicantKey})-[:TOOK]->(e:Evaluation)-[:OF_SUBJECT]->(s:Subject)
WHERE e.entryYear = $entryYear AND ($subjectKey IS NULL OR s.key = $subjectKey)
OPTIONAL MATCH (e)-[:TARGETS]->(c:Career)
RETURN a.key AS applicantKey, e AS evaluation, s AS subject, c AS career
ORDER BY e.assignmentDate, e.key
SKIP $offset LIMIT $fetchLimit
