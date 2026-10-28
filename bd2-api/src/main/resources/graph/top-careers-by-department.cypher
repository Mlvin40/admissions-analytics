MATCH (d:Department {key: $departmentKey})<-[:IN_DEPARTMENT]-(m:Municipality)
      <-[:FROM_MUNICIPALITY]-(e:Evaluation)<-[:TOOK]-(a:Applicant),
      (e)-[:TARGETS]->(c:Career)
WHERE e.entryYear = $entryYear AND ($municipalityKey IS NULL OR m.key = $municipalityKey)
WITH c, count(DISTINCT a.key) AS applicants
ORDER BY applicants DESC, c.key
LIMIT 5
RETURN c AS career, applicants
ORDER BY applicants DESC, c.key
SKIP $offset LIMIT $fetchLimit
