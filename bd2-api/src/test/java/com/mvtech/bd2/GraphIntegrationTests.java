package com.mvtech.bd2;

import com.mvtech.bd2.features.graph.repository.GraphRepository;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.neo4j.driver.Driver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "bd2.import-directory=${java.io.tmpdir}/bd2-graph-tests-${random.uuid}")
class GraphIntegrationTests {
    @LocalServerPort int port;
    @Autowired MongoTemplate mongo;
    @Autowired Driver driver;
    @MockitoSpyBean GraphRepository repository;

    private HttpResponse<String> get(String path) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/graph/" + path)).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }
    private Document page(String path) throws Exception {
        var response = get(path);
        assertEquals(200, response.statusCode(), response.body());
        return Document.parse(response.body());
    }
    private Document sample() {
        var doc = mongo.getCollection("evaluations").find(new Document("entryYear", 2015)
                .append("origin.municipality.known", true).append("subject.known", true)).first();
        assertNotNull(doc, "Se requieren los datos reales importados");
        return doc;
    }
    private static String applicant(Document doc) {
        return URLEncoder.encode(doc.get("applicant", Document.class).getString("key"), StandardCharsets.UTF_8);
    }
    @Test
    void fiveQueriesRunOnRealGraphAndReturnBoundedTypedPages() throws Exception {
        var e = sample();
        String subject = e.get("subject", Document.class).getString("key");
        String department = e.get("origin", Document.class).get("department", Document.class).getString("key");
        var paths = List.of("applicant-history?entryYear=2015&applicantKey=" + applicant(e),
                "approval-by-subject-career?entryYear=2015", "top-careers-by-department?entryYear=2015&departmentKey=" + department,
                "improved-outcomes?entryYear=2015&subjectKey=" + subject, "municipality-peers?entryYear=2015&applicantKey=" + applicant(e));
        for (int i = 0; i < paths.size(); i++) {
            var body = page(paths.get(i) + "&limit=1");
            assertEquals("N0" + (i + 1), body.getString("query"));
            assertEquals(1, body.getList("items", Document.class).size());
            assertNotNull(body.get("hasMore"));
            assertTrue(body.get("executionMs", Number.class).longValue() < 15000);
        }
    }
    @Test
    void rejectsMissingInvalidAndInapplicableParameters() throws Exception {
        for (String parameters : List.of("", "entryYear=0", "entryYear=10000", "entryYear=no", "entryYear=2024&limit=0",
                "entryYear=2024&limit=101", "entryYear=2024&offset=-1", "entryYear=2024&offset=10001",
                "entryYear=2024&careerKey=bad", "entryYear=2024&applicantKey=other:test", "entryYear=2024&departmentKey=" + "0".repeat(64))) {
            var response = get("approval-by-subject-career?" + parameters);
            assertEquals(400, response.statusCode(), parameters);
            assertFalse(response.body().contains("stackTrace"));
        }
        for (String path : List.of("applicant-history", "municipality-peers", "top-careers-by-department", "improved-outcomes")) {
            assertEquals(400, get(path + "?entryYear=2024").statusCode());
        }
        assertEquals(400, get("municipality-peers?entryYear=2024&applicantKey=other:test&limit=26").statusCode());
        assertEquals(400, get("applicant-history?entryYear=2024&applicantKey=prefix").statusCode());
        assertEquals(404, get("unknown-query?entryYear=2024").statusCode());
    }
    @Test
    void chronologicalHistoryMatchesMongoAndIncludesMissingCareer() throws Exception {
        var e = sample();
        String key = e.get("applicant", Document.class).getString("key");
        var expected = mongo.getCollection("evaluations").find(new Document("applicant.key", key).append("entryYear", 2015))
                .sort(new Document("assignmentDate", 1).append("_id", 1)).into(new ArrayList<>());
        List<Document> actual = new ArrayList<>();
        for (int offset = 0; ; offset++) {
            var response = page("applicant-history?entryYear=2015&applicantKey=" + applicant(e) + "&limit=1&offset=" + offset);
            actual.addAll(response.getList("items", Document.class));
            if (!response.getBoolean("hasMore")) break;
        }
        assertEquals(expected.stream().map(r -> r.getString("_id")).toList(),
                actual.stream().map(r -> r.get("evaluation", Document.class).getString("key")).toList());
        for (int i = 0; i < expected.size(); i++) {
            var career = expected.get(i).get("career", Document.class);
            if (!career.getBoolean("known")) assertNull(actual.get(i).get("career"));
        }
    }
    @Test
    void graphEdgesCorrespondToRealDirectedRelationshipsAndRespectFilters() throws Exception {
        var sample = sample();
        String path = "municipality-peers?entryYear=2015&applicantKey=" + applicant(sample);
        var page = page(path + "&limit=3");
        var rows = page.getList("items", Document.class);
        var graph = page.get("graph", Document.class);
        var nodes = graph.getList("nodes", Document.class);
        var edges = graph.getList("edges", Document.class);
        assertTrue(rows.size() <= 3 && nodes.size() <= 15 && edges.size() <= 12);
        Set<String> ids = new HashSet<>();
        nodes.forEach(n -> assertTrue(ids.add(n.getString("id"))));
        Set<String> edgeIds = new HashSet<>();
        for (var edge : edges) {
            assertTrue(edgeIds.add(edge.getString("id")));
            assertTrue(ids.contains(edge.getString("source")) && ids.contains(edge.getString("target")));
            assertTrue(List.of("TOOK", "FROM_MUNICIPALITY").contains(edge.getString("type")));
        }
        try (var session = driver.session()) {
            long count = session.executeRead(tx -> tx.run("""
                UNWIND $rows AS row
                MATCH (a:Applicant {key:row.applicantKey})-[:TOOK]->(e:Evaluation {key:row.evaluationKey})
                      -[:FROM_MUNICIPALITY]->(m:Municipality {key:row.municipalityKey})
                      <-[:FROM_MUNICIPALITY]-(other:Evaluation {key:row.peerEvaluationKey})
                      <-[:TOOK]-(peer:Applicant {key:row.peerApplicantKey})
                WHERE e.entryYear=2015 AND other.entryYear=2015 AND a.key<>peer.key
                RETURN count(*) AS count
                """, Map.of("rows", rows)).single().get("count").asLong());
            assertEquals(rows.size(), count);
        }
        var empty = page(path + "&municipalityKey=" + "0".repeat(64));
        assertTrue(empty.getList("items", Document.class).isEmpty());
        assertTrue(empty.get("graph", Document.class).getList("nodes", Document.class).isEmpty());
        assertFalse(empty.getBoolean("hasMore"));
        assertTrue(page("approval-by-subject-career?entryYear=9999").getList("items", Document.class).isEmpty());
    }
    @Test
    void connectionFailureReturnsControlled503AndNextRequestCanRecover() throws Exception {
        doThrow(new IllegalStateException("private server and credentials")).doCallRealMethod().when(repository).approvals(any());
        var response = get("approval-by-subject-career?entryYear=2024");
        assertEquals(503, response.statusCode());
        assertEquals("GRAPH_UNAVAILABLE", Document.parse(response.body()).getString("code"));
        assertFalse(response.body().contains("private"));
        assertEquals(200, get("approval-by-subject-career?entryYear=2024").statusCode());
    }
    @Test
    void cypherAggregationHandlesUnknownResultsAndZeroDenominatorWithoutWritingNodes() throws Exception {
        String query = new ClassPathResource("graph/approval-by-subject-career.cypher").getContentAsString(StandardCharsets.UTF_8);
        String aggregate = query.substring(query.indexOf("WITH s, c,"));
        Map<String, Object> unknown = new HashMap<>(); unknown.put("passed", null);
        Map<String, Object> row = Map.of("e", unknown, "s", Map.of("key", "s", "name", "Subject"), "c", Map.of("key", "c", "name", "Career"));
        try (var session = driver.session()) {
            var result = session.executeRead(tx -> tx.run("UNWIND $rows AS row WITH row.e AS e, row.s AS s, row.c AS c\n" + aggregate,
                    Map.of("rows", List.of(row, row), "offset", 0, "fetchLimit", 2)).single());
            assertEquals(2, result.get("evaluations").asInt());
            assertEquals(2, result.get("unknown").asInt());
            assertTrue(result.get("approvalRate").isNull());
        }
        assertNull(GraphRepository.dimension(org.neo4j.driver.Values.NULL));
    }
}
