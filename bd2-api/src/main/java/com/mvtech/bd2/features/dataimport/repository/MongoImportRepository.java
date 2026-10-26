package com.mvtech.bd2.features.dataimport.repository;

import com.mongodb.MongoCommandException;
import com.mongodb.client.model.*;
import org.bson.Document;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Repository
public class MongoImportRepository {
    private final MongoTemplate mongo;
    private final Document schema;

    public MongoImportRepository(MongoTemplate mongo) throws IOException {
        this.mongo = mongo;
        schema = Document.parse(new ClassPathResource("db/mongodb-schema.json").getContentAsString(StandardCharsets.UTF_8));
    }

    public void initialize() {
        try {
            mongo.getDb().runCommand(new Document("create", "evaluations").append("validator", schema.get("validator")));
        } catch (MongoCommandException exception) {
            if (exception.getErrorCode() != 48) throw exception;
        }
        for (Document index : schema.getList("indexes", Document.class)) {
            mongo.getCollection("evaluations").createIndex(index.get("keys", Document.class),
                    new IndexOptions().name(index.getString("name")));
        }
    }

    public Set<String> store(List<Document> batch) {
        // Una contradicción de sexo/año conocido se señala, sin sustituir el contexto de evaluaciones previas
        Map<String, Set<String>> sexes = new HashMap<>();
        Map<String, Set<Integer>> births = new HashMap<>();
        List<String> applicants = batch.stream().map(d -> d.get("applicant", Document.class).getString("key")).distinct().toList();
        List<Document> contexts = mongo.getCollection("evaluations").find(Filters.in("applicant.key", applicants))
                .projection(new Document("applicant", 1).append("sex", 1).append("birthYear", 1)).into(new ArrayList<>());
        contexts.addAll(batch);
        for (Document doc : contexts) {
            String applicant = doc.get("applicant", Document.class).getString("key");
            if (doc.getString("sex") != null) sexes.computeIfAbsent(applicant, key -> new HashSet<>()).add(doc.getString("sex"));
            if (doc.getInteger("birthYear") != null) births.computeIfAbsent(applicant, key -> new HashSet<>()).add(doc.getInteger("birthYear"));
        }
        List<WriteModel<Document>> writes = new ArrayList<>();
        for (Document doc : batch) {
            String applicant = doc.get("applicant", Document.class).getString("key");
            List<String> issues = new ArrayList<>(doc.getList("qualityIssues", String.class));
            if (sexes.getOrDefault(applicant, Set.of()).size() > 1 || births.getOrDefault(applicant, Set.of()).size() > 1) {
                issues.add("APPLICANT_CONTEXT_CONFLICT");
            }
            Document base = new Document(doc);
            base.remove("sources"); base.remove("qualityIssues"); base.remove("graphSyncState");
            Document source = doc.getList("sources", Document.class).getFirst();
            Document oldSources = new Document("$ifNull", List.of("$sources", List.of()));
            Document matches = new Document("$and", List.of(
                    new Document("$eq", List.of("$$s.fileSha256", source.getString("fileSha256"))),
                    new Document("$eq", List.of("$$s.recordNumber", source.get("recordNumber")))));
            Document mapped = new Document("$map", new Document("input", oldSources)
                    .append("as", "s").append("in", matches));
            Document sameOccurrence = new Document("$anyElementTrue", List.of(mapped));
            Document sources = new Document("$cond", List.of(sameOccurrence, oldSources,
                    new Document("$concatArrays", List.of(oldSources, new Document("$literal", List.of(source))))));
            Document mergedIssues = new Document("$setUnion", List.of(
                    new Document("$ifNull", List.of("$qualityIssues", List.of())), new Document("$literal", issues)));
            // La identidad de procedencia es hash/registro, incluso si se renombra el archivo y cambia fileYear
            Document stage = new Document("$replaceWith", new Document("$mergeObjects", List.of(
                    new Document("$literal", base), "$$ROOT", new Document("sources", sources)
                            .append("qualityIssues", mergedIssues).append("graphSyncState", "PENDING"))));
            writes.add(new UpdateOneModel<>(Filters.eq("_id", doc.getString("_id")), List.of(stage), new UpdateOptions().upsert(true)));
        }
        // MongoDB standalone puede confirmar solo parte de un bulk fallido; el diario no lo cuenta como confirmado
        var result = mongo.getCollection("evaluations").bulkWrite(writes, new BulkWriteOptions().ordered(true));
        Set<String> inserted = new HashSet<>();
        result.getUpserts().forEach(upsert -> inserted.add(upsert.getId().asString().getValue()));
        return inserted;
    }

    public List<Document> stored(List<Document> batch) {
        return mongo.getCollection("evaluations").find(Filters.in("_id", batch.stream().map(d -> d.getString("_id")).distinct().toList()))
                .projection(new Document("sources", 0)).into(new ArrayList<>());
    }

    public void graphState(List<Document> batch, String state) {
        var result = mongo.getCollection("evaluations").updateMany(Filters.in("_id", batch.stream().map(d -> d.getString("_id")).toList()),
                new Document("$set", new Document("graphSyncState", state)));
        long expected = batch.stream().map(doc -> doc.getString("_id")).distinct().count();
        if (result.getMatchedCount() != expected) throw new IllegalStateException("Faltan evaluaciones por confirmar");
    }
}
