package com.mvtech.bd2.features.analytics.repository;

import com.mvtech.bd2.features.analytics.dto.AnalyticsFilter;
import org.bson.Document;
import org.springframework.stereotype.Component;

import java.time.ZoneOffset;
import java.util.*;

@Component
public class AnalyticsPipelines {
    private static final Map<String, String> DIMENSIONS = Map.of("career", "career", "subject", "subject",
            "institutionType", "origin.institutionType", "department", "origin.department", "municipality", "origin.municipality");

    public static Document stage(String op, Object value) { return new Document(op, value); }
    public static Document expression(String op, Object... values) { return new Document(op, Arrays.asList(values)); }
    public static Document sum(Object value) { return new Document("$sum", value); }
    public static Document first(Object value) { return new Document("$first", value); }
    public static Document countWhen(Object condition) { return sum(expression("$cond", condition, 1L, 0L)); }
    public static Document knownOutcome() { return expression("$in", expression("$ifNull", "$passed", null), List.of(true, false)); }
    public static Document validAge() {
        return expression("$and", new Document("$isNumber", "$entryAge"), expression("$gte", "$entryAge", 0), expression("$lte", "$entryAge", 100));
    }
    public static Document ageValue() { return expression("$cond", validAge(), "$entryAge", null); }
    public static Document positiveNumber(String field) {
        return expression("$and", new Document("$isNumber", field), expression("$gt", field, 0));
    }
    public static Document validOpportunity() {
        return expression("$cond", new Document("$isNumber", "$opportunity"),
                expression("$and", expression("$gt", "$opportunity", 0), expression("$eq", expression("$mod", "$opportunity", 1), 0)), false);
    }
    public static Document rate(String numerator, String denominator) {
        return expression("$cond", expression("$gt", denominator, 0),
                expression("$divide", expression("$multiply", 100.0, numerator), denominator), null);
    }

    public List<Document> filters(AnalyticsFilter filter) {
        Document match = new Document();
        if (filter.entryYear() != null) match.put("entryYear", filter.entryYear());
        Map<String, String> keys = new LinkedHashMap<>();
        keys.put("career.key", filter.careerKey()); keys.put("subject.key", filter.subjectKey());
        keys.put("origin.institutionType.key", filter.institutionTypeKey());
        keys.put("origin.department.key", filter.departmentKey()); keys.put("origin.municipality.key", filter.municipalityKey());
        keys.forEach((key, value) -> { if (value != null) match.put(key, value); });
        if (filter.sex() != null) match.put("sex", filter.sex().equalsIgnoreCase("SIN REGISTRO") ? null : filter.sex().strip().toUpperCase(Locale.ROOT));
        if (filter.passed() != null) match.put("passed", filter.passed());
        if (filter.minAge() != null || filter.maxAge() != null) {
            Document age = new Document("$type", "number").append("$gte", 0).append("$lte", 100);
            if (filter.minAge() != null) age.put("$gte", filter.minAge());
            if (filter.maxAge() != null) age.put("$lte", filter.maxAge());
            match.put("entryAge", age);
        }
        if (filter.assignmentFrom() != null || filter.assignmentTo() != null) {
            Document date = new Document();
            if (filter.assignmentFrom() != null) date.put("$gte", Date.from(filter.assignmentFrom().atStartOfDay(ZoneOffset.UTC).toInstant()));
            if (filter.assignmentTo() != null) date.put("$lt", Date.from(filter.assignmentTo().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant()));
            match.put("assignmentDate", date);
        }
        return new ArrayList<>(List.of(stage("$match", match)));
    }

    private Document grouping(String... names) {
        Document keys = new Document();
        for (String name : names) keys.put(name, DIMENSIONS.containsKey(name) ? "$" + DIMENSIONS.get(name) + ".key"
                : name.equals("age") ? "$_age" : name.equals("month") ? "$_month" : expression("$ifNull", "$" + name, null));
        return keys;
    }
    private Document labels(String... names) {
        Document labels = new Document();
        for (String name : names) labels.put(name, DIMENSIONS.containsKey(name) ? "$" + DIMENSIONS.get(name)
                : name.equals("age") ? "$_age" : name.equals("month") ? "$_month" : expression("$ifNull", "$" + name, null));
        if (Arrays.asList(names).contains("municipality")) labels.put("department", "$origin.department");
        return labels;
    }
    private void distinctApplicants(List<Document> pipeline, String... dimensions) {
        Document keys = grouping(dimensions).append("applicant", "$applicant.key");
        pipeline.add(stage("$group", new Document("_id", keys).append("_g", first(labels(dimensions)))));
        Document second = new Document();
        for (String name : dimensions) second.put(name, "$_id." + name);
        pipeline.add(stage("$group", new Document("_id", second).append("_g", first("$_g")).append("applicantCount", sum(1L))));
    }
    private void evaluationCounts(List<Document> pipeline, String... dimensions) {
        pipeline.add(stage("$group", new Document("_id", grouping(dimensions)).append("_g", first(labels(dimensions)))
                .append("evaluationCount", sum(1L))));
    }
    private void outcomeCounts(List<Document> pipeline, String... dimensions) {
        pipeline.add(stage("$group", new Document("_id", grouping(dimensions)).append("_g", first(labels(dimensions)))
                .append("evaluationCount", sum(1L)).append("approvedCount", countWhen(expression("$eq", "$passed", true)))
                .append("failedCount", countWhen(expression("$eq", "$passed", false)))
                .append("knownOutcomeCount", countWhen(knownOutcome()))));
        pipeline.add(stage("$set", new Document("unknownOutcomeCount", expression("$subtract", "$evaluationCount", "$knownOutcomeCount"))
                .append("approvalRate", rate("$approvedCount", "$knownOutcomeCount"))
                .append("failureRate", rate("$failedCount", "$knownOutcomeCount"))));
    }
    private void meanAge(List<Document> pipeline, String... dimensions) {
        // El representante se elige antes de excluir edades; no se rellena desde otro ciclo anterior
        pipeline.add(stage("$sort", new Document("entryYear", -1).append("assignmentDate", -1).append("opportunity", -1).append("_id", -1)));
        pipeline.add(stage("$group", new Document("_id", grouping(dimensions).append("applicant", "$applicant.key"))
                .append("_g", first(labels(dimensions))).append("age", first("$_age"))));
        Document keys = new Document();
        for (String name : dimensions) keys.put(name, "$_id." + name);
        pipeline.add(stage("$group", new Document("_id", keys).append("_g", first("$_g"))
                .append("applicantCount", sum(1L)).append("meanAge", new Document("$avg", "$age"))
                .append("ageSampleCount", countWhen(new Document("$isNumber", "$age")))
                .append("excludedAgeApplicantCount", countWhen(expression("$eq", "$age", null)))));
    }

    public List<Document> metric(AnalyticsQuery query, AnalyticsFilter filter) {
        List<Document> pipeline = filters(filter);
        pipeline.add(stage("$project", new Document("sources", 0).append("qualityIssues", 0).append("graphSyncState", 0)));
        pipeline.add(stage("$set", new Document("_age", ageValue())));
        switch (query) {
            // M01 - Aspirantes por tipo de institución educativa
            case M01 -> distinctApplicants(pipeline, "institutionType");
            // M02 - Evaluaciones aprobadas por materia
            case M02 -> { pipeline.add(stage("$match", new Document("passed", true))); evaluationCounts(pipeline, "subject"); }
            // M03 - Aspirantes aprobados por carrera y ciclo de ingreso
            case M03 -> { pipeline.add(stage("$match", new Document("passed", true))); distinctApplicants(pipeline, "career", "entryYear"); }
            // M04 - Porcentaje de aprobación por materia
            case M04 -> outcomeCounts(pipeline, "subject");
            // M05 - Promedio de edad por carrera
            case M05 -> meanAge(pipeline, "career");
            // M07 - Promedio de edad de aprobados por carrera y tipo de institución
            case M07 -> { pipeline.add(stage("$match", new Document("passed", true))); meanAge(pipeline, "career", "institutionType"); }
            // M08 - Aspirantes aprobados por municipio y carrera
            case M08 -> { pipeline.add(stage("$match", new Document("passed", true))); distinctApplicants(pipeline, "municipality", "career"); }
            // M09 - Evaluaciones de instituciones públicas por mes y materia
            case M09 -> {
                pipeline.add(stage("$match", new Document("origin.institutionType.name", "PUBLICO").append("assignmentDate", new Document("$type", "date"))));
                pipeline.add(stage("$set", new Document("_month", new Document("$dateToString", new Document("format", "%Y-%m").append("date", "$assignmentDate").append("timezone", "UTC")))));
                evaluationCounts(pipeline, "month", "subject");
            }
            // M10 - Cinco carreras más solicitadas por aspirantes de 16 a 18 años
            case M10 -> {
                pipeline.add(stage("$match", new Document("career.known", true).append("_age", new Document("$gte", 16).append("$lte", 18))));
                distinctApplicants(pipeline, "career");
            }
            // M12 - Aspirantes por sexo y tipo de institución
            case M12 -> distinctApplicants(pipeline, "sex", "institutionType");
            // M13 - Porcentaje de aprobación por edad
            case M13 -> { pipeline.add(stage("$match", new Document("_age", new Document("$ne", null)))); outcomeCounts(pipeline, "age"); }
            // M14 - Promedio de oportunidades observadas por materia
            case M14 -> {
                pipeline.add(stage("$match", new Document("$expr", expression("$and", positiveNumber("$entryYear"), expression("$eq", "$subject.known", true)))));
                pipeline.add(stage("$group", new Document("_id", grouping("subject", "entryYear").append("applicant", "$applicant.key"))
                        .append("_g", first(labels("subject")))
                        .append("opportunities", new Document("$addToSet", expression("$cond", validOpportunity(), "$opportunity", null)))
                        .append("evaluations", sum(1L))));
                pipeline.add(stage("$set", new Document("observed", new Document("$size", expression("$setDifference", "$opportunities", Collections.singletonList(null))))));
                pipeline.add(stage("$group", new Document("_id", new Document("subject", "$_id.subject"))
                        .append("_g", first("$_g")).append("evaluationCount", sum("$evaluations"))
                        .append("meanAttempts", new Document("$avg", expression("$cond", expression("$gt", "$observed", 0), "$observed", null)))
                        .append("applicantCycleCount", countWhen(expression("$gt", "$observed", 0)))
                        .append("excludedAttemptGroups", countWhen(expression("$eq", "$observed", 0)))));
            }
            // M16 - Aspirantes reprobados en la primera oportunidad por carrera
            case M16 -> {
                pipeline.add(stage("$match", new Document("opportunity", 1).append("passed", false).append("career.known", true)));
                distinctApplicants(pipeline, "career");
            }
            // M17 - Cinco municipios con más aspirantes
            case M17 -> { pipeline.add(stage("$match", new Document("origin.municipality.known", true))); distinctApplicants(pipeline, "municipality"); }
            // M18 - Porcentaje de aprobación por tipo de institución
            case M18 -> outcomeCounts(pipeline, "institutionType");
            // M19 - Demanda de carreras por departamento
            case M19 -> {
                pipeline.add(stage("$match", new Document("career.known", true).append("origin.department.known", true)));
                distinctApplicants(pipeline, "department", "career");
                // $documentNumber admite una sola clave; el documento ordena por cantidad descendente y clave ascendente
                pipeline.add(stage("$set", new Document("_rankOrder", new Document("negativeCount", expression("$multiply", -1, "$applicantCount"))
                        .append("careerKey", "$_g.career.key"))));
                pipeline.add(stage("$setWindowFields", new Document("partitionBy", "$_g.department.key")
                        .append("sortBy", new Document("_rankOrder", 1))
                        .append("output", new Document("rank", new Document("$documentNumber", new Document())))));
            }
            // M20 - Evolución de aprobación por ciclo de ingreso
            case M20 -> outcomeCounts(pipeline, "entryYear");
            default -> throw new IllegalArgumentException("Esta consulta requiere un pipeline específico");
        }
        pipeline.add(stage("$set", new Document("_tie", "$_id").append("_count",
                query.unit().equals("APPLICANTS") || query.unit().equals("APPLICANT_AGES") ? "$applicantCount"
                        : query == AnalyticsQuery.M14 ? "$applicantCycleCount" : "$evaluationCount")));
        if (query == AnalyticsQuery.M10 || query == AnalyticsQuery.M17) {
            pipeline.add(stage("$sort", new Document("applicantCount", -1).append("_tie", 1)));
            pipeline.add(stage("$limit", 5));
        }
        return pipeline;
    }

    public Document metricProjection() {
        Document projection = new Document("_id", 0).append("group", "$_g");
        for (String field : List.of("applicantCount", "evaluationCount", "approvedCount", "failedCount", "unknownOutcomeCount",
                "knownOutcomeCount", "approvalRate", "failureRate", "meanAge", "ageSampleCount", "excludedAgeApplicantCount",
                "meanAttempts", "applicantCycleCount", "excludedAttemptGroups", "rank", "applicantsWithApproval")) projection.put(field, 1);
        return projection;
    }

    public Document sort(AnalyticsQuery query, AnalyticsFilter filter) {
        String field = filter.sort() == null ? query.defaultSort() : filter.sort();
        int direction = filter.direction() == null ? (field.equals("key") ? 1 : -1) : filter.direction().equals("asc") ? 1 : -1;
        if (query == AnalyticsQuery.M19 && filter.sort() == null) return new Document("_g.department.key", 1).append("rank", 1);
        String actual = switch (field) {
            case "key" -> "_tie"; case "count" -> "_count"; case "rate" -> "approvalRate";
            case "age" -> "meanAge"; case "attempts" -> "meanAttempts"; default -> throw new IllegalArgumentException();
        };
        return actual.equals("_tie") ? new Document("_tie", direction) : new Document(actual, direction).append("_tie", 1);
    }

    public List<Document> exclusions(AnalyticsQuery query, AnalyticsFilter filter) {
        List<Document> pipeline = filters(filter);
        Document condition;
        switch (query) {
            case M09 -> condition = new Document("origin.institutionType.name", "PUBLICO").append("assignmentDate", new Document("$not", new Document("$type", "date")));
            case M10 -> condition = new Document("$expr", expression("$or", expression("$not", validAge()),
                    expression("$and", expression("$gte", "$entryAge", 16), expression("$lte", "$entryAge", 18),
                            expression("$ne", "$career.known", true))));
            case M13 -> condition = new Document("$expr", expression("$not", validAge()));
            case M14 -> condition = new Document("$expr", expression("$not", expression("$and", positiveNumber("$entryYear"),
                    expression("$eq", "$subject.known", true), validOpportunity())));
            case M16 -> condition = new Document("opportunity", 1).append("passed", false).append("career.known", new Document("$ne", true));
            case M17 -> condition = new Document("origin.municipality.known", new Document("$ne", true));
            case M19 -> condition = new Document("$or", List.of(new Document("career.known", new Document("$ne", true)),
                    new Document("origin.department.known", new Document("$ne", true))));
            default -> { return List.of(); }
        }
        pipeline.add(stage("$match", condition)); pipeline.add(stage("$count", "count"));
        return pipeline;
    }

    // M06 - Resumen de estadísticas por carrera
    public List<Document> summary(Date generatedAt, String snapshot, long count, String target) {
        List<Document> pipeline = new ArrayList<>();
        pipeline.add(stage("$project", new Document("sources", 0).append("qualityIssues", 0).append("graphSyncState", 0)));
        pipeline.add(stage("$set", new Document("_age", ageValue())));
        pipeline.add(stage("$sort", new Document("entryYear", -1).append("assignmentDate", -1).append("opportunity", -1).append("_id", -1)));
        pipeline.add(stage("$group", new Document("_id", new Document("career", "$career.key").append("applicant", "$applicant.key"))
                .append("career", first("$career")).append("age", first("$_age"))
                .append("evaluationCount", sum(1L)).append("approved", countWhen(expression("$eq", "$passed", true)))
                .append("failed", countWhen(expression("$eq", "$passed", false))).append("known", countWhen(knownOutcome()))));
        pipeline.add(stage("$group", new Document("_id", "$_id.career").append("career", first("$career"))
                .append("evaluationCount", sum("$evaluationCount")).append("uniqueApplicantCount", sum(1L))
                .append("approvedEvaluationCount", sum("$approved")).append("failedEvaluationCount", sum("$failed"))
                .append("known", sum("$known")).append("applicantsWithApproval", countWhen(expression("$gt", "$approved", 0)))
                .append("meanApplicantAge", new Document("$avg", "$age"))
                .append("ageSampleCount", countWhen(new Document("$isNumber", "$age")))
                .append("excludedAgeApplicantCount", countWhen(expression("$eq", "$age", null)))));
        pipeline.add(stage("$set", new Document("unknownOutcomeCount", expression("$subtract", "$evaluationCount", "$known"))
                .append("approvalRate", rate("$approvedEvaluationCount", "$known"))
                .append("generatedAt", generatedAt).append("sourceSnapshot", snapshot).append("sourceEvaluationCount", count)));
        pipeline.add(stage("$unset", "known"));
        pipeline.add(stage("$out", target));
        return pipeline;
    }
}
