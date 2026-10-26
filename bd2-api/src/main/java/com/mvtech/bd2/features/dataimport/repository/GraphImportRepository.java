package com.mvtech.bd2.features.dataimport.repository;

import org.bson.Document;
import org.neo4j.driver.Driver;
import org.neo4j.driver.TransactionConfig;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.*;

@Repository
public class GraphImportRepository {
    private final Driver driver;
    private final String schema;
    private final String query;

    public GraphImportRepository(Driver driver) throws IOException {
        this.driver = driver;
        schema = new ClassPathResource("db/neo4j-schema.cypher").getContentAsString(StandardCharsets.UTF_8);
        query = new ClassPathResource("db/neo4j-import.cypher").getContentAsString(StandardCharsets.UTF_8);
    }

    public void initialize() {
        try (var session = driver.session()) {
            for (String statement : schema.split(";")) {
                if (!statement.isBlank()) session.run(statement).consume();
            }
        }
    }

    public void write(List<Document> documents) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Document doc : documents) {
            Map<String, Object> props = new HashMap<>();
            for (String field : List.of("entryYear", "birthYear", "sex", "opportunity", "passed", "entryAge", "qualityIssues")) {
                props.put(field, doc.get(field));
            }
            Date date = doc.getDate("assignmentDate");
            props.put("assignmentDate", date == null ? null : date.toInstant().atZone(ZoneOffset.UTC).toLocalDate());
            props.put("key", doc.getString("_id"));
            Document origin = doc.get("origin", Document.class);
            Map<String, Object> row = new HashMap<>();
            row.put("props", props);
            row.put("applicant", doc.get("applicant"));
            row.put("subject", doc.get("subject"));
            row.put("career", doc.get("career"));
            for (String field : List.of("department", "municipality", "institutionType")) row.put(field, origin.get(field));
            rows.add(row);
        }
        // El lote se confirma en una transacción Neo4j; repetir MERGE tras un resultado incierto es seguro
        try (var session = driver.session()) {
            session.executeWrite(tx -> { tx.run(query, Map.of("rows", rows)).consume(); return null; },
                    TransactionConfig.builder().withTimeout(Duration.ofSeconds(60)).build());
        }
    }
}
