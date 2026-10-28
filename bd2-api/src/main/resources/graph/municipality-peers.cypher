MATCH (a:Applicant {key: $applicantKey})-[:TOOK]->(e:Evaluation)
      -[:FROM_MUNICIPALITY]->(m:Municipality)<-[:FROM_MUNICIPALITY]
      -(other:Evaluation)<-[:TOOK]-(peer:Applicant)
WHERE e.entryYear = $entryYear AND other.entryYear = $entryYear AND peer.key <> a.key
  AND ($municipalityKey IS NULL OR m.key = $municipalityKey)
RETURN DISTINCT a, e, m, other, peer
ORDER BY e.key, m.key, other.key, peer.key
SKIP $offset LIMIT $fetchLimit
