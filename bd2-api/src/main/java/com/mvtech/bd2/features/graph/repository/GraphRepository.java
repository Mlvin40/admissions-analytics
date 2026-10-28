package com.mvtech.bd2.features.graph.repository;

import com.mvtech.bd2.features.graph.dto.GraphFilter;
import com.mvtech.bd2.features.graph.dto.GraphDtos.*;
import org.neo4j.driver.*;
import org.neo4j.driver.Record;
import org.neo4j.driver.types.Node;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

@Repository
public class GraphRepository {
    private final Driver driver;
    private final Map<GraphQueries, String> queries = new EnumMap<>(GraphQueries.class);
    public record Slice<T>(List<T> rows, long databaseMs) { }
    public record PeerResult(PeerPath path, List<GraphNode> nodes) { }

    public GraphRepository(Driver driver) throws IOException {
        this.driver = driver;
        for (var query : GraphQueries.values()) {
            queries.put(query, new ClassPathResource("graph/" + query.path() + ".cypher").getContentAsString(StandardCharsets.UTF_8));
        }
    }
    private Map<String, Object> parameters(GraphFilter filter) {
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("entryYear", filter.entryYear()); parameters.put("applicantKey", filter.applicantKey());
        parameters.put("subjectKey", filter.subjectKey()); parameters.put("careerKey", filter.careerKey());
        parameters.put("departmentKey", filter.departmentKey()); parameters.put("municipalityKey", filter.municipalityKey());
        parameters.put("offset", filter.pageOffset()); parameters.put("fetchLimit", filter.pageLimit() + 1);
        return parameters;
    }
    private <T> Slice<T> read(GraphQueries query, GraphFilter filter, Function<Record, T> mapper) {
        try (var session = driver.session(SessionConfig.builder().withDefaultAccessMode(AccessMode.READ).build())) {
            // Transacción explícita de lectura sin reintentos prolongados; timeout y resultados acotados en Cypher
            try (var tx = session.beginTransaction(TransactionConfig.builder().withTimeout(Duration.ofSeconds(10)).build())) {
                var result = tx.run(queries.get(query), parameters(filter));
                List<T> rows = result.list(mapper);
                var summary = result.consume();
                tx.commit();
                return new Slice<>(rows, summary.resultAvailableAfter(TimeUnit.MILLISECONDS) + summary.resultConsumedAfter(TimeUnit.MILLISECONDS));
            }
        }
    }
    public Slice<HistoryRow> history(GraphFilter filter) {
        return read(GraphQueries.N01, filter, r -> new HistoryRow(r.get("applicantKey").asString(), evaluation(r.get("evaluation")),
                dimension(r.get("subject")), dimension(r.get("career"))));
    }
    public Slice<ApprovalRow> approvals(GraphFilter filter) {
        return read(GraphQueries.N02, filter, r -> new ApprovalRow(dimension(r.get("subject")), dimension(r.get("career")),
                r.get("evaluations").asLong(), r.get("approved").asLong(), r.get("failed").asLong(), r.get("unknown").asLong(),
                r.get("approvalRate").isNull() ? null : r.get("approvalRate").asDouble()));
    }
    public Slice<DemandRow> demand(GraphFilter filter) {
        return read(GraphQueries.N03, filter, r -> new DemandRow(dimension(r.get("career")), r.get("applicants").asLong()));
    }
    public Slice<ProgressionRow> progressions(GraphFilter filter) {
        return read(GraphQueries.N04, filter, r -> new ProgressionRow(r.get("applicantKey").asString(), dimension(r.get("subject")),
                evaluation(r.get("failed")), evaluation(r.get("passed"))));
    }
    public Slice<PeerResult> peers(GraphFilter filter) {
        return read(GraphQueries.N05, filter, r -> new PeerResult(new PeerPath(r.get("a").get("key").asString(),
                r.get("e").get("key").asString(), r.get("m").get("key").asString(), r.get("other").get("key").asString(),
                r.get("peer").get("key").asString()), List.of(node(r.get("a"), "Applicant"), node(r.get("e"), "Evaluation"),
                node(r.get("m"), "Municipality"), node(r.get("other"), "Evaluation"), node(r.get("peer"), "Applicant"))));
    }
    private static String string(Value value) { return value.isNull() ? null : value.asString(); }
    private static Integer integer(Value value) { return value.isNull() ? null : value.asInt(); }
    public static Dimension dimension(Value value) {
        return value.isNull() ? null : new Dimension(string(value.get("key")), string(value.get("name")), string(value.get("sourceValue")));
    }
    public static Evaluation evaluation(Value value) {
        return new Evaluation(value.get("key").asString(), value.get("assignmentDate").isNull() ? null : value.get("assignmentDate").asLocalDate(),
                integer(value.get("entryYear")), integer(value.get("opportunity")), value.get("passed").isNull() ? null : value.get("passed").asBoolean());
    }
    private static GraphNode node(Value value, String label) {
        Node n = value.asNode();
        String key = n.get("key").asString();
        return new GraphNode(label + ":" + key, label, key, new NodeProperties(string(n.get("name")), string(n.get("sourceValue")),
                string(n.get("departmentKey")), string(n.get("correlativo_aspirante")), string(n.get("identityScheme")), integer(n.get("entryYear")),
                n.get("assignmentDate").isNull() ? null : n.get("assignmentDate").asLocalDate(), integer(n.get("opportunity")),
                n.get("passed").isNull() ? null : n.get("passed").asBoolean(), integer(n.get("entryAge"))));
    }
}
