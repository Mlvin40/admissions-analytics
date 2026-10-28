package com.mvtech.bd2.features.analytics.repository;

import com.mvtech.bd2.features.analytics.dto.AnalyticsFilter;
import com.mvtech.bd2.features.analytics.dto.AnalyticsDtos.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;

import static com.mvtech.bd2.features.analytics.repository.AnalyticsPipelines.*;

@Repository
public class AnalyticsRepository {
    private final MongoTemplate mongo;
    private final AnalyticsPipelines pipelines;

    public AnalyticsRepository(MongoTemplate mongo, AnalyticsPipelines pipelines) {
        this.mongo = mongo; this.pipelines = pipelines;
    }
    public record Slice(List<Document> items, long total) { }
    public record Fingerprint(long count, String hash) { }

    public <T> T map(Document document, Class<T> type) { return mongo.getConverter().read(type, document); }
    public static long number(Document doc, String key) { return doc.get(key) instanceof Number n ? n.longValue() : 0; }

    private Document firstResult(String collection, List<Document> pipeline) {
        Document result = mongo.getCollection(collection).aggregate(pipeline).allowDiskUse(true)
                .maxTime(20, TimeUnit.SECONDS).first();
        return result == null ? new Document() : result;
    }
    public Slice page(String collection, List<Document> base, List<Document> items) {
        List<Document> pipeline = new ArrayList<>(base);
        pipeline.add(stage("$facet", new Document("items", items).append("total", List.of(stage("$count", "count")))));
        Document result = firstResult(collection, pipeline);
        List<Document> totals = result.getList("total", Document.class, List.of());
        return new Slice(result.getList("items", Document.class, List.of()), totals.isEmpty() ? 0 : number(totals.getFirst(), "count"));
    }
    public Slice metrics(AnalyticsQuery query, AnalyticsFilter filter) {
        return page("evaluations", pipelines.metric(query, filter), List.of(stage("$sort", pipelines.sort(query, filter)),
                stage("$skip", filter.pageOffset()), stage("$limit", filter.pageLimit()), stage("$project", pipelines.metricProjection())));
    }
    public long excluded(AnalyticsQuery query, AnalyticsFilter filter) {
        List<Document> exclusions = pipelines.exclusions(query, filter);
        return exclusions.isEmpty() ? 0 : number(firstResult("evaluations", exclusions), "count");
    }
    public Slice history(AnalyticsQuery query, AnalyticsFilter filter, String applicantKey, Document cursor) {
        List<Document> base = pipelines.filters(filter);
        base.add(stage("$match", new Document("applicant.key", applicantKey)));
        base.add(stage("$set", new Document("_sortYear", expression("$ifNull", "$entryYear", Long.MAX_VALUE))
                .append("_sortDate", expression("$ifNull", "$assignmentDate", new Date(253402214400000L)))));
        List<Document> items = new ArrayList<>();
        if (cursor != null) {
            items.add(stage("$match", new Document("$or", List.of(
                    new Document("_sortYear", new Document("$gt", cursor.get("year"))),
                    new Document("_sortYear", cursor.get("year")).append("_sortDate", new Document("$gt", cursor.get("date"))),
                    new Document("_sortYear", cursor.get("year")).append("_sortDate", cursor.get("date")).append("_id", new Document("$gt", cursor.getString("id")))))));
        }
        items.add(stage("$sort", new Document("_sortYear", 1).append("_sortDate", 1).append("_id", 1)));
        items.add(stage("$skip", filter.pageOffset())); items.add(stage("$limit", filter.pageLimit() + 1));
        Document projection = new Document("_id", 0).append("evaluationId", "$_id").append("_sortYear", 1).append("_sortDate", 1)
                .append("subject", 1).append("career", 1).append("entryYear", 1).append("opportunity", 1)
                .append("passed", 1).append("assignmentDate", 1);
        if (query == AnalyticsQuery.M11) projection.put("applicantKey", "$applicant.key");
        else for (String field : List.of("applicant", "birthYear", "sex", "entryAge", "origin", "qualityIssues", "sources")) projection.put(field, 1);
        items.add(stage("$project", projection));
        return page("evaluations", base, items);
    }

    public Fingerprint fingerprint() {
        long count = number(firstResult("evaluations", List.of(stage("$count", "count"))), "count");
        List<String> hashes = mongo.getCollection("evaluations").distinct("sources.fileSha256", String.class)
                .maxTime(20, TimeUnit.SECONDS).into(new ArrayList<>());
        Collections.sort(hashes);
        try {
            String content = count + "\n" + String.join("\n", hashes);
            return new Fingerprint(count, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8))));
        } catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    public Document summaryMetadata() {
        return mongo.getCollection("analytics_metadata").find(new Document("_id", "career-summary")).first();
    }
    public void buildSummary(Date generated, Fingerprint fingerprint, String staging) {
        // El agregado solo escribe su colección temporal; las evaluaciones permanecen intactas
        mongo.getCollection("evaluations").aggregate(pipelines.summary(generated, fingerprint.hash(), fingerprint.count(), staging))
                .allowDiskUse(true).maxTime(30, TimeUnit.SECONDS).toCollection();
    }
    public void publishSummary(Date generated, Fingerprint fingerprint, String staging) {
        // renameCollection publica atómicamente el resumen completo, nunca páginas o carreras parciales
        mongo.getCollection(staging).renameCollection(new com.mongodb.MongoNamespace(mongo.getDb().getName(), "resumen_carrera"),
                new com.mongodb.client.model.RenameCollectionOptions().dropTarget(true));
        mongo.getCollection("analytics_metadata").replaceOne(new Document("_id", "career-summary"),
                new Document("_id", "career-summary").append("generatedAt", generated)
                        .append("sourceSnapshot", fingerprint.hash()).append("sourceEvaluationCount", fingerprint.count()),
                new com.mongodb.client.model.ReplaceOptions().upsert(true));
    }
    public void discardStaging(String staging) {
        if (!staging.startsWith("resumen_carrera_build_")) throw new IllegalArgumentException();
        if (mongo.collectionExists(staging)) mongo.getCollection(staging).drop();
    }
    public long summaryCount() { return number(firstResult("resumen_carrera", List.of(stage("$count", "count"))), "count"); }
    public boolean summaryPublicationMatches(Document metadata) {
        return mongo.getCollection("resumen_carrera").countDocuments(new Document("sourceSnapshot",
                new Document("$ne", metadata.getString("sourceSnapshot")))) == 0;
    }
    public Slice summary(AnalyticsFilter filter) {
        List<Document> base = new ArrayList<>();
        if (filter.careerKey() != null) base.add(stage("$match", new Document("_id", filter.careerKey())));
        base.add(stage("$set", new Document("_g", new Document("career", "$career")).append("_tie", "$_id")
                .append("_count", "$uniqueApplicantCount").append("applicantCount", "$uniqueApplicantCount")
                .append("approvedCount", "$approvedEvaluationCount").append("failedCount", "$failedEvaluationCount")
                .append("knownOutcomeCount", expression("$add", "$approvedEvaluationCount", "$failedEvaluationCount"))
                .append("meanAge", "$meanApplicantAge")));
        return page("resumen_carrera", base, List.of(stage("$sort", pipelines.sort(AnalyticsQuery.M06, filter)),
                stage("$skip", filter.pageOffset()), stage("$limit", filter.pageLimit()), stage("$project", pipelines.metricProjection())));
    }
}
