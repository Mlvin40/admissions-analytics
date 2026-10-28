package com.mvtech.bd2.features.analytics.service;

import com.mvtech.bd2.features.analytics.dto.AnalyticsFilter;
import com.mvtech.bd2.features.analytics.dto.AnalyticsDtos.*;
import com.mvtech.bd2.features.analytics.repository.AnalyticsQuery;
import com.mvtech.bd2.features.analytics.repository.AnalyticsRepository;
import org.bson.Document;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;

@Service
public class AnalyticsService {
    private final AnalyticsRepository repository;
    public AnalyticsService(AnalyticsRepository repository) { this.repository = repository; }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }

    private void validate(AnalyticsFilter filter, AnalyticsQuery query) {
        if (filter.minAge() != null && filter.maxAge() != null && filter.minAge() > filter.maxAge()) throw invalid("minAge debe ser menor o igual que maxAge");
        if (filter.assignmentFrom() != null && filter.assignmentTo() != null && filter.assignmentFrom().isAfter(filter.assignmentTo())) throw invalid("Rango de fechas invertido");
        if ((filter.assignmentFrom() != null && (filter.assignmentFrom().getYear() < 1 || filter.assignmentFrom().getYear() > 9999))
                || (filter.assignmentTo() != null && (filter.assignmentTo().getYear() < 1 || filter.assignmentTo().getYear() > 9999))) throw invalid("Fecha fuera de rango");
        boolean history = query == AnalyticsQuery.M11 || query == AnalyticsQuery.M15;
        if (!history && (filter.correlativo() != null || filter.identityScheme() != null || filter.cursor() != null)) throw invalid("Identificador y cursor solo corresponden a historiales");
        if (history && (filter.sort() != null || filter.direction() != null)) throw invalid("Los historiales tienen orden cronológico fijo y cursor estable");
        if (filter.cursor() != null && filter.pageOffset() != 0) throw invalid("No combinar cursor y offset");
        String sort = filter.sort();
        if (sort != null && sort.equals("rate") && !List.of(AnalyticsQuery.M04, AnalyticsQuery.M13, AnalyticsQuery.M18, AnalyticsQuery.M20, AnalyticsQuery.M06).contains(query)) throw invalid("Orden rate no disponible en esta consulta");
        if (sort != null && sort.equals("age") && !List.of(AnalyticsQuery.M05, AnalyticsQuery.M07, AnalyticsQuery.M06).contains(query)) throw invalid("Orden age no disponible en esta consulta");
        if (sort != null && sort.equals("attempts") && query != AnalyticsQuery.M14) throw invalid("Orden attempts solo disponible para intentos");
        if (query == AnalyticsQuery.M06 && (filter.entryYear() != null || filter.subjectKey() != null || filter.institutionTypeKey() != null
                || filter.departmentKey() != null || filter.municipalityKey() != null || filter.sex() != null || filter.passed() != null
                || filter.minAge() != null || filter.maxAge() != null || filter.assignmentFrom() != null || filter.assignmentTo() != null)) {
            throw invalid("El resumen es global; admite careerKey, paginación y ordenamiento");
        }
    }

    public Page<MetricRow> metrics(AnalyticsQuery query, AnalyticsFilter filter) {
        validate(filter, query);
        if (query == AnalyticsQuery.M11 || query == AnalyticsQuery.M15) throw invalid("Utilice el endpoint de historial");
        if (query == AnalyticsQuery.M06) return summary(filter);
        long start = System.nanoTime();
        var slice = repository.metrics(query, filter);
        long excluded = repository.excluded(query, filter);
        return new Page<>(query.name(), query.unit(), filter.pageOffset(), filter.pageLimit(), slice.total(), excluded, null,
                slice.items().stream().map(doc -> repository.map(doc, MetricRow.class)).toList(), notes(query), null, elapsed(start));
    }
    private static long elapsed(long start) { return (System.nanoTime() - start) / 1000000; }
    private static List<String> notes(AnalyticsQuery query) {
        List<String> notes = new ArrayList<>(List.of("Identidades observadas por igualdad completa, sin unir prefijos; sources no multiplica evaluaciones",
                "Categorías conservan claves y representaciones originales; grupos no necesariamente suman aspirantes globales"));
        if (List.of(AnalyticsQuery.M03, AnalyticsQuery.M07, AnalyticsQuery.M08).contains(query)) notes.add("Aspirante aprobado: al menos una evaluación aprobada en el filtro, no admisión ni aprobación de todas las materias");
        if (List.of(AnalyticsQuery.M04, AnalyticsQuery.M13, AnalyticsQuery.M18, AnalyticsQuery.M20).contains(query)) notes.add("Porcentajes sobre evaluaciones de resultado conocido; denominador cero devuelve null");
        if (query == AnalyticsQuery.M05 || query == AnalyticsQuery.M07 || query == AnalyticsQuery.M06) notes.add("Edad aproximada al ingreso de la observación más reciente por aspirante/grupo; no se rellena desde otro ciclo; muestra y exclusiones explícitas");
        if (query == AnalyticsQuery.M09) notes.add("Mes de asignación UTC, única fecha disponible; solo PUBLICO; excluye fechas ausentes o inválidas");
        if (query == AnalyticsQuery.M10) notes.add("Edades válidas 16–18 y carreras conocidas; top cinco seleccionado por aspirantes antes de paginar");
        if (query == AnalyticsQuery.M13) notes.add("Edades válidas 0–100; excludedEvaluations cuenta edades no utilizables");
        if (query == AnalyticsQuery.M14) notes.add("Media de oportunidades distintas observadas por aspirante/ciclo/materia, no máximo ordinal; grupos sin ordinal válido se informan por separado");
        if (query == AnalyticsQuery.M16) notes.add("Oportunidad 1 real, no mínimo observado; aprobación posterior no elimina la reprobación inicial; carreras conocidas");
        if (query == AnalyticsQuery.M17) notes.add("Top cinco municipios conocidos por aspirantes; clave incluye departamento y texto observado");
        if (query == AnalyticsQuery.M19) notes.add("Ranking por departamento con categorías conocidas; empates se ordenan por clave de carrera");
        return notes;
    }

    private String applicantKey(AnalyticsFilter filter) {
        if (filter.correlativo() == null || filter.correlativo().isBlank()) throw invalid("correlativo es obligatorio para historiales");
        String id = Normalizer.normalize(filter.correlativo().strip(), Normalizer.Form.NFC);
        String scheme = filter.identityScheme() != null ? filter.identityScheme()
                : id.matches("[0-9a-f]{32}") ? "full32" : id.matches("[0-9a-f]{20,23}") ? "short" : "other";
        return scheme + ":" + id;
    }
    private Document decode(String cursor) {
        if (cursor == null) return null;
        try {
            Document decoded = Document.parse(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8));
            if (!(decoded.get("year") instanceof Number) || !(decoded.get("date") instanceof Date)
                    || decoded.getString("id") == null || !decoded.getString("id").matches("[0-9a-f]{64}")) throw new IllegalArgumentException();
            return new Document("year", ((Number) decoded.get("year")).longValue()).append("date", decoded.getDate("date")).append("id", decoded.getString("id"));
        } catch (RuntimeException exception) { throw invalid("Cursor inválido"); }
    }
    public <T> Page<T> history(AnalyticsQuery query, AnalyticsFilter filter, Class<T> type) {
        validate(filter, query);
        long start = System.nanoTime();
        var slice = repository.history(query, filter, applicantKey(filter), decode(filter.cursor()));
        List<Document> rows = slice.items();
        boolean more = rows.size() > filter.pageLimit();
        if (more) rows = rows.subList(0, filter.pageLimit());
        String next = null;
        if (more && !rows.isEmpty()) {
            Document last = rows.getLast();
            Document token = new Document("year", last.get("_sortYear")).append("date", last.get("_sortDate")).append("id", last.getString("evaluationId"));
            next = Base64.getUrlEncoder().withoutPadding().encodeToString(token.toJson().getBytes(StandardCharsets.UTF_8));
        }
        return new Page<>(query.name(), query.unit(), filter.pageOffset(), filter.pageLimit(), slice.total(), 0, next,
                rows.stream().map(row -> repository.map(row, type)).toList(), notes(query), null, elapsed(start));
    }

    public synchronized RefreshResult refresh() {
        var before = repository.fingerprint();
        Date generatedAt = new Date();
        String staging = "resumen_carrera_build_" + UUID.randomUUID().toString().replace("-", "");
        try {
            repository.buildSummary(generatedAt, before, staging);
            var after = repository.fingerprint();
            if (!before.equals(after)) throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Los datos cambiaron durante el cálculo; reintente al finalizar las importaciones");
            repository.publishSummary(generatedAt, before, staging);
            return new RefreshResult(repository.summaryCount(), new SummaryInfo(generatedAt.toInstant(), before.hash(), before.count(), false));
        } finally { repository.discardStaging(staging); }
    }

    private synchronized Page<MetricRow> summary(AnalyticsFilter filter) {
        long start = System.nanoTime();
        Document metadata = repository.summaryMetadata();
        if (metadata == null) return new Page<>("M06", AnalyticsQuery.M06.unit(), filter.pageOffset(), filter.pageLimit(), 0, 0, null,
                List.of(), List.of("Resumen no generado: utilice POST /api/analytics/career-summary/refresh"),
                new SummaryInfo(null, null, 0, true), elapsed(start));
        if (!repository.summaryPublicationMatches(metadata)) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Publicación del resumen incompleta; reconstruya el resumen");
        var current = repository.fingerprint();
        boolean stale = !metadata.getString("sourceSnapshot").equals(current.hash());
        var slice = repository.summary(filter);
        return new Page<>("M06", AnalyticsQuery.M06.unit(), filter.pageOffset(), filter.pageLimit(), slice.total(), 0, null,
                slice.items().stream().map(row -> repository.map(row, MetricRow.class)).toList(), notes(AnalyticsQuery.M06),
                new SummaryInfo(metadata.getDate("generatedAt").toInstant(), metadata.getString("sourceSnapshot"),
                        AnalyticsRepository.number(metadata, "sourceEvaluationCount"), stale), elapsed(start));
    }
}
