package com.mvtech.bd2.features.graph.service;

import com.mvtech.bd2.features.graph.dto.GraphFilter;
import com.mvtech.bd2.features.graph.dto.GraphDtos.*;
import com.mvtech.bd2.features.graph.repository.GraphQueries;
import com.mvtech.bd2.features.graph.repository.GraphRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class GraphService {
    private final GraphRepository repository;
    public GraphService(GraphRepository repository) { this.repository = repository; }

    private void validate(GraphQueries query, GraphFilter filter) {
        Set<String> allowed = switch (query) {
            case N01 -> Set.of("applicantKey", "subjectKey");
            case N02 -> Set.of("subjectKey", "careerKey");
            case N03 -> Set.of("departmentKey", "municipalityKey");
            case N04 -> Set.of("subjectKey");
            case N05 -> Set.of("applicantKey", "municipalityKey");
        };
        Map<String, String> supplied = new HashMap<>();
        supplied.put("applicantKey", filter.applicantKey()); supplied.put("subjectKey", filter.subjectKey());
        supplied.put("careerKey", filter.careerKey()); supplied.put("departmentKey", filter.departmentKey());
        supplied.put("municipalityKey", filter.municipalityKey());
        for (var field : supplied.entrySet()) {
            if (field.getValue() != null && !allowed.contains(field.getKey())) throw invalid("Filtro no disponible en esta consulta: " + field.getKey());
        }
        String required = switch (query) {
            case N01, N05 -> "applicantKey"; case N03 -> "departmentKey"; case N04 -> "subjectKey"; default -> null;
        };
        if (required != null && supplied.get(required) == null) throw invalid(required + " es obligatorio");
        if (query == GraphQueries.N05 && filter.pageLimit() > 25) throw invalid("El subgrafo admite como máximo 25 caminos por página");
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private List<String> notes(GraphQueries query) {
        return switch (query) {
            case N01 -> List.of("Identidad completa dentro del ciclo; múltiples evaluaciones y oportunidades; carrera ausente se conserva como null",
                    "Fecha de asignación, no fecha efectiva de examen");
            case N02 -> List.of("Cuenta evaluaciones con materia y carrera representadas en el grafo, no aspirantes",
                    "Porcentaje sobre resultados conocidos; denominador cero devuelve null; categorías sin nodo quedan fuera");
            case N03 -> List.of("Top cinco por aspirantes distintos dentro del ciclo y departamento; desempate por clave de carrera",
                    "Municipio contextualizado por departamento; etiquetas truncadas o con espacios conservan claves distintas");
            case N04 -> List.of("Parejas distintas de evaluaciones de una identidad, materia y ciclo con reprobación y aprobación en ordinal mayor",
                    "No cuenta aspirantes únicos ni intentos; un aspirante puede producir varias parejas; no demuestra cronología del examen");
            case N05 -> List.of("Caminos de cuatro relaciones; no demuestra misma escuela ni relación personal entre aspirantes",
                    "Nodos y aristas deduplicados solo para serializar la página; direcciones y tipos son los almacenados");
        };
    }
    private <T> Page<T> page(GraphQueries query, GraphFilter filter, GraphRepository.Slice<T> slice, long start) {
        boolean more = slice.rows().size() > filter.pageLimit();
        List<T> rows = slice.rows().subList(0, Math.min(filter.pageLimit(), slice.rows().size()));
        return new Page<>(query.name(), query.unit(), filter.pageOffset(), filter.pageLimit(), more, List.copyOf(rows), null,
                notes(query), slice.databaseMs(), (System.nanoTime() - start) / 1000000);
    }
    public Page<HistoryRow> history(GraphFilter filter) {
        validate(GraphQueries.N01, filter); long start = System.nanoTime();
        return page(GraphQueries.N01, filter, repository.history(filter), start);
    }
    public Page<ApprovalRow> approvals(GraphFilter filter) {
        validate(GraphQueries.N02, filter); long start = System.nanoTime();
        return page(GraphQueries.N02, filter, repository.approvals(filter), start);
    }
    public Page<DemandRow> demand(GraphFilter filter) {
        validate(GraphQueries.N03, filter); long start = System.nanoTime();
        return page(GraphQueries.N03, filter, repository.demand(filter), start);
    }
    public Page<ProgressionRow> progressions(GraphFilter filter) {
        validate(GraphQueries.N04, filter); long start = System.nanoTime();
        return page(GraphQueries.N04, filter, repository.progressions(filter), start);
    }
    public Page<PeerPath> peers(GraphFilter filter) {
        validate(GraphQueries.N05, filter); long start = System.nanoTime();
        var slice = repository.peers(filter);
        Map<String, GraphNode> nodes = new LinkedHashMap<>();
        Map<String, GraphEdge> edges = new LinkedHashMap<>();
        List<PeerPath> paths = new ArrayList<>();
        // Solo se transforma la página ya limitada por Cypher, sin calcular estadísticas ni recorrer el grafo en Java
        for (var row : slice.rows().subList(0, Math.min(filter.pageLimit(), slice.rows().size()))) {
            paths.add(row.path());
            row.nodes().forEach(n -> nodes.putIfAbsent(n.id(), n));
            var path = row.path();
            edge(edges, "Applicant:" + path.applicantKey(), "Evaluation:" + path.evaluationKey(), "TOOK");
            edge(edges, "Evaluation:" + path.evaluationKey(), "Municipality:" + path.municipalityKey(), "FROM_MUNICIPALITY");
            edge(edges, "Evaluation:" + path.peerEvaluationKey(), "Municipality:" + path.municipalityKey(), "FROM_MUNICIPALITY");
            edge(edges, "Applicant:" + path.peerApplicantKey(), "Evaluation:" + path.peerEvaluationKey(), "TOOK");
        }
        return new Page<>("N05", GraphQueries.N05.unit(), filter.pageOffset(), filter.pageLimit(), slice.rows().size() > filter.pageLimit(),
                List.copyOf(paths), new GraphData(List.copyOf(nodes.values()), List.copyOf(edges.values())), notes(GraphQueries.N05),
                slice.databaseMs(), (System.nanoTime() - start) / 1000000);
    }
    private static void edge(Map<String, GraphEdge> edges, String source, String target, String type) {
        String id = type + ":" + source + ":" + target;
        edges.putIfAbsent(id, new GraphEdge(id, source, target, type));
    }
}
