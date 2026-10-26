UNWIND $rows AS row
MERGE (a:Applicant {key: row.applicant.key}) SET a += row.applicant
MERGE (e:Evaluation {key: row.props.key}) SET e += row.props
MERGE (a)-[:TOOK]->(e)
FOREACH (s IN CASE WHEN row.subject IS NULL THEN [] ELSE [row.subject] END |
  MERGE (n:Subject {key: s.key}) SET n.name = s.name
  MERGE (e)-[:OF_SUBJECT]->(n))
FOREACH (c IN CASE WHEN row.career.known THEN [row.career] ELSE [] END |
  MERGE (n:Career {key: c.key}) SET n.name = c.name, n.sourceValue = c.sourceValue
  MERGE (e)-[:TARGETS]->(n))
FOREACH (t IN CASE WHEN row.institutionType.known THEN [row.institutionType] ELSE [] END |
  MERGE (n:InstitutionType {key: t.key}) SET n.name = t.name
  MERGE (e)-[:FROM_INSTITUTION_TYPE]->(n))
FOREACH (d IN CASE WHEN row.department.known THEN [row.department] ELSE [] END |
  MERGE (n:Department {key: d.key}) SET n.name = d.name, n.sourceValue = d.sourceValue)
FOREACH (m IN CASE WHEN row.municipality.known THEN [row.municipality] ELSE [] END |
  MERGE (n:Municipality {key: m.key}) SET n.name = m.name, n.sourceValue = m.sourceValue, n.departmentKey = m.departmentKey
  MERGE (e)-[:FROM_MUNICIPALITY]->(n)
  FOREACH (d IN CASE WHEN row.department.known THEN [row.department] ELSE [] END |
    MERGE (dep:Department {key: d.key}) MERGE (n)-[:IN_DEPARTMENT]->(dep)))
