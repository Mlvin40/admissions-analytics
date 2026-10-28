MATCH (a:Applicant)-[:TOOK]->(failed:Evaluation {entryYear: $entryYear, passed: false})
      -[:OF_SUBJECT]->(s:Subject {key: $subjectKey}),
      (a)-[:TOOK]->(passed:Evaluation)-[:OF_SUBJECT]->(s)
WHERE passed.entryYear = $entryYear AND passed.passed = true
  AND failed.opportunity < passed.opportunity
RETURN DISTINCT a.key AS applicantKey, s AS subject, failed, passed
ORDER BY applicantKey, failed.key, passed.key
SKIP $offset LIMIT $fetchLimit
