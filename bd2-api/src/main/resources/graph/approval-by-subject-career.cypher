MATCH (s:Subject)<-[:OF_SUBJECT]-(e:Evaluation {entryYear: $entryYear})-[:TARGETS]->(c:Career)
WHERE ($subjectKey IS NULL OR s.key = $subjectKey) AND ($careerKey IS NULL OR c.key = $careerKey)
WITH s, c, count(e) AS evaluations, count(e.passed) AS known,
     sum(CASE WHEN e.passed = true THEN 1 ELSE 0 END) AS approved,
     sum(CASE WHEN e.passed = false THEN 1 ELSE 0 END) AS failed
RETURN s AS subject, c AS career, evaluations, approved, failed, evaluations - known AS unknown,
       CASE WHEN known = 0 THEN null ELSE 100.0 * approved / known END AS approvalRate
ORDER BY s.name, c.key
SKIP $offset LIMIT $fetchLimit
