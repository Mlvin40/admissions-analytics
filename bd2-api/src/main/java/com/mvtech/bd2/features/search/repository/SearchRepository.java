package com.mvtech.bd2.features.search.repository;

import com.mvtech.bd2.features.analytics.dto.AnalyticsDtos.HistoryRow;
import com.mvtech.bd2.features.search.dto.SearchDtos.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Repository;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@Repository
public class SearchRepository {
    private final MongoTemplate mongo;
    public SearchRepository(MongoTemplate mongo) { this.mongo = mongo; }
    private static Document stage(String operator, Object value) { return new Document(operator, value); }
    private Document page(List<Document> pipeline, List<Document> items) {
        pipeline.add(stage("$facet", new Document("items", items).append("total", List.of(stage("$count", "count")))));
        return mongo.getCollection("evaluations").aggregate(pipeline).allowDiskUse(true).maxTime(10, TimeUnit.SECONDS).first();
    }
    private static long total(Document result) {
        var counts = result.getList("total", Document.class);
        return counts.isEmpty() ? 0 : ((Number) counts.getFirst().get("count")).longValue();
    }
    public ResultsPage search(Filter filter, String applicantKey) {
        Document match = new Document();
        if (applicantKey != null) match.put("applicant.key", applicantKey);
        if (filter.entryYear() != null) match.put("entryYear", filter.entryYear());
        Map<String,String> dimensions = new LinkedHashMap<>();
        dimensions.put("career.key", filter.careerKey()); dimensions.put("subject.key", filter.subjectKey());
        dimensions.put("origin.department.key", filter.departmentKey()); dimensions.put("origin.municipality.key", filter.municipalityKey());
        dimensions.put("origin.institutionType.key", filter.institutionTypeKey());
        dimensions.forEach((key,value) -> { if (value != null) match.put(key,value); });
        Document projection = new Document("_id", 0).append("evaluationId", "$_id");
        for (String field : List.of("applicant","assignmentDate","entryYear","birthYear","sex","opportunity","passed","entryAge","subject","career","origin","qualityIssues","sources")) projection.put(field,1);
        Document result = page(new ArrayList<>(List.of(stage("$match", match))), List.of(
                stage("$sort", new Document("entryYear",-1).append("assignmentDate",-1).append("_id",1)),
                stage("$skip",filter.pageOffset()), stage("$limit",filter.pageLimit()), stage("$project",projection)));
        return new ResultsPage(result.getList("items",Document.class).stream().map(d -> mongo.getConverter().read(HistoryRow.class,d)).toList(),
                total(result),filter.pageOffset(),filter.pageLimit());
    }
    public OptionsPage options(LookupFilter filter) {
        String path = switch (filter.dimension()) {
            case "career", "subject" -> filter.dimension();
            case "department", "municipality", "institutionType" -> "origin." + filter.dimension();
            default -> throw new IllegalArgumentException();
        };
        Document match = new Document(path+".key",new Document("$ne",null));
        if (filter.key() != null) match.put(path+".key",filter.key());
        if (filter.departmentKey() != null) match.put("origin.department.key",filter.departmentKey());
        List<Document> pipeline = new ArrayList<>(List.of(stage("$match",match)));
        Document group = new Document("_id","$"+path+".key");
        for (String field : List.of("name","sourceValue","known","departmentKey")) group.put(field,new Document("$first","$"+path+"."+field));
        if (filter.dimension().equals("municipality")) group.put("contextName",new Document("$first","$origin.department.name"));
        pipeline.add(stage("$group",group));
        // La búsqueda textual resuelve etiquetas; las identidades de aspirantes siguen siendo literales y completas
        if (filter.q() != null && !filter.q().isBlank()) {
            var regex = new Document("$regex",Pattern.quote(filter.q().strip())).append("$options","i");
            pipeline.add(stage("$match",new Document("$or",List.of(new Document("name",regex),new Document("sourceValue",regex),new Document("contextName",regex)))));
        }
        var result = page(pipeline,List.of(stage("$sort",new Document("name",1).append("_id",1)),stage("$skip",filter.pageOffset()),
                stage("$limit",filter.pageLimit()),stage("$project",new Document("_id",0).append("key","$_id").append("name",1)
                        .append("sourceValue",1).append("known",1).append("departmentKey",1).append("contextName",1))));
        return new OptionsPage(result.getList("items",Document.class).stream().map(d -> mongo.getConverter().read(Option.class,d)).toList(),
                total(result),filter.pageOffset(),filter.pageLimit());
    }
}
