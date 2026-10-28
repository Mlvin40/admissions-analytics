package com.mvtech.bd2;

import com.mvtech.bd2.features.analytics.repository.AnalyticsQuery;
import com.mvtech.bd2.features.analytics.repository.AnalyticsRepository;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "bd2.import-directory=${java.io.tmpdir}/bd2-analytics-http-${random.uuid}")
class AnalyticsHttpTests {
    @LocalServerPort int port;
    @Autowired MongoTemplate mongo;
    @MockitoSpyBean AnalyticsRepository repository;

    private HttpResponse<String> get(String path) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/analytics/" + path)).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }
    @Test
    void rejectsInvalidParametersAndUnknownQueries() throws Exception {
        for (String parameters : List.of("limit=0", "limit=101", "offset=-1", "offset=1000001", "entryYear=no",
                "careerKey=bad", "minAge=20&maxAge=10", "assignmentFrom=2024-02-30", "assignmentFrom=2024-02-01&assignmentTo=2024-01-01",
                "assignmentFrom=+10000-01-01", "sort=injected", "sort=attempts", "cursor=bad", "correlativo=partial")) {
            var response = get("approval-rate-by-subject?" + parameters);
            assertEquals(400, response.statusCode(), parameters);
            assertFalse(response.body().contains("stackTrace"));
        }
        assertEquals(404, get("unknown-query").statusCode());
        assertEquals(400, get("career-summary?entryYear=2024").statusCode());
        assertEquals(400, get("applicant-history").statusCode());
        assertEquals(400, get("applicant-history?correlativo=abc&cursor=bad").statusCode());
        assertEquals(400, get("applicant-performance?correlativo=abc&sort=count").statusCode());
    }
    @Test
    void realQueriesReturnBoundedTypedPagesAndEmptyResults() throws Exception {
        for (var query : AnalyticsQuery.values()) {
            if (query == AnalyticsQuery.M11 || query == AnalyticsQuery.M15) continue;
            var response = get(query.path() + "?limit=1");
            assertEquals(200, response.statusCode(), query.name() + response.body());
            var body = Document.parse(response.body());
            assertEquals(query.name(), body.getString("query"));
            assertTrue(body.getList("items", Document.class).size() <= 1);
            assertNotNull(body.get("total"));
        }
        var response = get("approval-evolution-by-entry-year?entryYear=9999");
        assertEquals(200, response.statusCode());
        assertEquals(0, Document.parse(response.body()).getList("items", Document.class).size());
        assertEquals(200, get("applicants-by-institution-type?careerKey=" + "0".repeat(64)).statusCode());
    }
    @Test
    void realHistoryContainsSourcesWithoutPrefixMerges() throws Exception {
        var evaluation = mongo.getCollection("evaluations").find().first();
        assertNotNull(evaluation, "Se requieren evaluaciones importadas para esta prueba de integración");
        String identity = evaluation.get("applicant", Document.class).getString("correlativo_aspirante");
        for (String path : List.of("applicant-history", "applicant-performance")) {
            var response = get(path + "?correlativo=" + identity + "&limit=1");
            assertEquals(200, response.statusCode());
            var item = Document.parse(response.body()).getList("items", Document.class).getFirst();
            assertEquals(64, item.getString("evaluationId").length());
            if (path.equals("applicant-history")) assertFalse(item.getList("sources", Document.class).isEmpty());
        }
        var partial = get("applicant-history?correlativo=" + identity.substring(0, 10));
        assertEquals(0, Document.parse(partial.body()).getList("items", Document.class).size());
    }
    @Test
    void storageFailureReturnsControlled503WithoutInternalDetails() throws Exception {
        doThrow(new IllegalStateException("private credentials and internal host"))
                .when(repository).metrics(any(), any());
        var response = get("approval-rate-by-subject");
        assertEquals(503, response.statusCode());
        assertEquals("ANALYTICS_UNAVAILABLE", Document.parse(response.body()).getString("code"));
        assertFalse(response.body().contains("private"));
    }
}
