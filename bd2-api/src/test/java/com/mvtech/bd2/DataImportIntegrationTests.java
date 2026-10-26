package com.mvtech.bd2;

import com.mvtech.bd2.features.dataimport.dto.ImportResult;
import com.mvtech.bd2.features.dataimport.service.*;
import com.mvtech.bd2.features.dataimport.repository.*;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.neo4j.driver.Driver;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.anyList;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "bd2.import-directory=${java.io.tmpdir}/bd2-import-tests-${random.uuid}")
class DataImportIntegrationTests {
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @Autowired DataImportService service;
    @Autowired ImportFileStore files;
    @Autowired MongoTemplate mongo;
    @Autowired Driver driver;
    @MockitoSpyBean GraphImportRepository graph;
    @MockitoSpyBean MongoImportRepository persistence;

    private byte[] fixture(String name) throws Exception { return new ClassPathResource("dataimport/" + name).getContentAsByteArray(); }
    private ImportResult upload(String name, byte[] content) throws Exception {
        return service.submit(new MockMultipartFile[]{new MockMultipartFile("files", name, "text/csv", content)}).getFirst();
    }
    private ImportResult await(String id) throws Exception {
        long end = System.nanoTime() + Duration.ofSeconds(60).toNanos();
        while (System.nanoTime() < end) {
            ImportResult result = ImportResult.from(files.read(id));
            if (!List.of("QUEUED", "RUNNING").contains(result.status())) return result;
            Thread.sleep(25);
        }
        throw new AssertionError("La carga no finalizó");
    }

    @Test
    void bothLayoutsPersistRealNodesAndReimportKeepsSourceOccurrences() throws Exception {
        String original = new String(fixture("full-headers.csv"), StandardCharsets.UTF_8);
        String[] lines = original.split("\n");
        String blankIdentity = lines[1].substring(0, lines[1].lastIndexOf(',')) + ",\"\"";
        byte[] csv = (lines[0] + "\n" + lines[1] + "\n" + lines[1] + "\n" + lines[2] + "\nwrong,width\n" + blankIdentity + "\n").getBytes(StandardCharsets.UTF_8);
        ImportResult first = await(upload("sample.csv", csv).id());
        assertEquals("COMPLETED_WITH_REJECTIONS", first.status(), first.message());
        assertEquals(5, first.totalRead()); assertEquals(3, first.processed());
        assertEquals(2, first.rejected()); assertEquals(1, first.duplicates()); assertEquals(0, first.pending());
        assertEquals(2, files.rejections(first.id(), 0, 25).items().size());
        ImportResult repeated = await(upload("renamed_2099.csv", csv).id());
        assertEquals(0, repeated.newEvaluations()); assertEquals(2, repeated.alreadyExisting()); assertEquals(1, repeated.duplicates());
        String digest = EvaluationTransformer.hash(csv);
        var docs = mongo.getCollection("evaluations").find(new Document("sources.fileSha256", digest)).into(new java.util.ArrayList<>());
        assertEquals(2, docs.size());
        long occurrences = docs.stream().flatMap(d -> d.getList("sources", Document.class).stream()).filter(s -> digest.equals(s.getString("fileSha256"))).count();
        assertEquals(3, occurrences);
        try (var session = driver.session()) {
            for (Document doc : docs) {
                var record = session.run("MATCH (a:Applicant)-[r:TOOK]->(e:Evaluation {key:$key}) RETURN count(e) AS count", java.util.Map.of("key", doc.getString("_id"))).single();
                assertEquals(1, record.get("count").asInt());
                assertEquals("SYNCED", doc.getString("graphSyncState"));
            }
        }
        ImportResult modern = await(upload("modern.csv", fixture("short-headers.csv")).id());
        assertEquals("COMPLETED", modern.status(), modern.message()); assertEquals(2, modern.processed());
    }

    @Test
    void partialGraphFailureAndMongoFailureAreRecoverableWithoutLosingDiagnostics() throws Exception {
        doThrow(new IllegalStateException("private connection data")).when(graph).write(anyList());
        ImportResult partial;
        try {
            partial = await(upload("partial.csv", fixture("full-headers.csv")).id());
            assertEquals("PARTIAL", partial.status()); assertEquals(2, partial.mongoStored());
            assertEquals(0, partial.processed()); assertEquals(2, partial.pending());
            assertFalse(partial.message().contains("private"));
        } finally { doCallRealMethod().when(graph).write(anyList()); }
        ImportResult retry = await(service.retry(partial.id()).id());
        assertEquals("COMPLETED", retry.status(), retry.message()); assertEquals(2, retry.processed()); assertEquals(2, retry.attempt());
        assertEquals(1, files.read(retry.id()).getList("attemptHistory", Document.class).size());
        doThrow(new IllegalStateException("private MongoDB URI")).when(persistence).store(anyList());
        ImportResult failed;
        try {
            failed = await(upload("mongo-error.csv", fixture("full-headers.csv")).id());
            assertEquals("FAILED", failed.status()); assertEquals(0, failed.mongoStored()); assertEquals(2, failed.pending());
            assertFalse(failed.message().contains("private"));
        } finally { doCallRealMethod().when(persistence).store(anyList()); }
        assertEquals("COMPLETED", await(service.retry(failed.id()).id()).status());
    }

    @Test
    void acceptsMultipleFilesOverHttpAndValidatesPagination() throws Exception {
        String boundary = "bd2-import-test-boundary";
        StringBuilder body = new StringBuilder();
        for (String name : List.of("full-headers.csv", "short-headers.csv")) {
            body.append("--").append(boundary).append("\r\nContent-Disposition: form-data; name=\"files\"; filename=\"")
                    .append(name).append("\"\r\nContent-Type: text/csv\r\n\r\n")
                    .append(new String(fixture(name), StandardCharsets.UTF_8)).append("\r\n");
        }
        body.append("--").append(boundary).append("--\r\n");
        try (var client = java.net.http.HttpClient.newHttpClient()) {
            var response = client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:" + port + "/api/imports"))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body.toString())).build(), java.net.http.HttpResponse.BodyHandlers.ofString());
            assertEquals(202, response.statusCode(), response.body());
            var jobs = Document.parse("{\"items\":" + response.body() + "}").getList("items", Document.class);
            assertEquals(2, jobs.size());
            for (Document job : jobs) assertEquals("COMPLETED", await(job.getString("id")).status());
            var invalid = client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:" + port + "/api/imports?limit=0")).build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertEquals(400, invalid.statusCode());
            assertEquals("Paginación inválida", Document.parse(invalid.body()).getString("message"));
        }
    }

    @Test
    void rejectsACorruptedCachedCopyBeforeConfirmingAnyRows() throws Exception {
        ImportResult first = await(upload("integrity.csv", fixture("full-headers.csv")).id());
        assertEquals("COMPLETED", first.status());
        java.nio.file.Files.writeString(files.path(first.id(), ".csv"), "corrupted cached copy");
        ImportResult retry = await(service.retry(first.id()).id());
        assertEquals("FAILED", retry.status());
        assertEquals(0, retry.totalRead()); assertEquals(0, retry.mongoStored());
        assertTrue(retry.message().contains("no coincide con su hash"));
    }

    @Test
    void rejectionPagesDoNotPublishRowsBeyondTheDurableCheckpoint() throws Exception {
        Document job = files.create(new MockMultipartFile("files", "checkpoint.csv", "text/csv", fixture("full-headers.csv")));
        files.reject(job, 1, "Confirmed", List.of("first"));
        job.put("totalRead", 1L); job.put("rejected", 1L); files.write(job);
        files.reject(job, 2, "Written before checkpoint", List.of("second"));
        var page = files.rejections(job.getString("id"), 0, 25);
        assertEquals(1, page.total()); assertEquals(1, page.items().size());
        assertEquals(1, page.items().getFirst().recordNumber());
    }

    @Test
    void malformedFilesAndExtensionsFailWithoutPretendingToHaveReadRows() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> upload("bad.txt", fixture("full-headers.csv")));
        ImportResult header = await(upload("bad.csv", "wrong,header\n1,2\n".getBytes(StandardCharsets.UTF_8)).id());
        assertEquals("FAILED", header.status()); assertEquals(0, header.totalRead());
        ImportResult broken = await(upload("broken.csv", (new String(fixture("full-headers.csv"), StandardCharsets.UTF_8) + "\"unterminated").getBytes(StandardCharsets.UTF_8)).id());
        assertEquals("FAILED", broken.status()); assertEquals(1, broken.rejected());
        assertEquals(broken.totalRead(), broken.valid() + broken.rejected());
        ImportResult encoding = await(upload("encoding.csv", new byte[]{(byte) 0xc3, (byte) 0x28}).id());
        assertEquals("FAILED", encoding.status());
        assertTrue(encoding.message().contains("codificación"));
    }
}
