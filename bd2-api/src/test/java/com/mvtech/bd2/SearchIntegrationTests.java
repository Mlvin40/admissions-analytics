package com.mvtech.bd2;

import com.mvtech.bd2.features.search.repository.SearchRepository;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="bd2.import-directory=${java.io.tmpdir}/bd2-search-${random.uuid}")
class SearchIntegrationTests {
    @LocalServerPort int port; @Autowired MongoTemplate mongo; @MockitoSpyBean SearchRepository repository;
    private HttpResponse<String> get(String path) throws Exception { try(var client=HttpClient.newHttpClient()){return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/search/"+path)).build(),HttpResponse.BodyHandlers.ofString());} }
    private Document page(String path) throws Exception {var r=get(path);assertEquals(200,r.statusCode(),r.body());return Document.parse(r.body());}
    @Test void resolvesAllDimensionsWithoutMergingRawVariants() throws Exception {
        for(String dimension:List.of("career","subject","department","municipality","institutionType")){
            var p=page("options?dimension="+dimension+"&limit=100");assertFalse(p.getList("items",Document.class).isEmpty());assertTrue(p.getList("items",Document.class).size()<=100);
        }
        var variants=page("options?dimension=career&q=MECANICA").getList("items",Document.class).stream().filter(d->d.getString("name").equals("INGENIERIA MECANICA")).toList();
        assertEquals(2,variants.size());assertNotEquals(variants.get(0).getString("key"),variants.get(1).getString("key"));
        assertTrue(page("options?dimension=career&q="+URLEncoder.encode(".*",StandardCharsets.UTF_8)).getList("items",Document.class).isEmpty());
        var place=page("options?dimension=municipality&limit=1").getList("items",Document.class).getFirst();
        var exact=page("options?dimension=municipality&key="+place.getString("key"));assertEquals(1,exact.getList("items",Document.class).size());
        assertTrue(page("options?dimension=municipality&departmentKey="+"0".repeat(64)).getList("items",Document.class).isEmpty());
        var unknown=mongo.getCollection("evaluations").find(new Document("origin.department.known",false)).first();assertNotNull(unknown);
        var unknownKey=unknown.get("origin",Document.class).get("department",Document.class).getString("key");
        assertFalse(page("options?dimension=municipality&departmentKey="+unknownKey).getList("items",Document.class).isEmpty());
    }
    @Test void exactIdentitiesCombinedFiltersAndPaginationMatchStoredData() throws Exception {
        for(String scheme:List.of("full32","short")){
            var e=mongo.getCollection("evaluations").find(new Document("applicant.identityScheme",scheme)).first();assertNotNull(e);
            var a=e.get("applicant",Document.class);var id=a.getString("correlativo_aspirante");
            var p=page("evaluations?correlativo="+id+"&limit=1");assertEquals(mongo.getCollection("evaluations").countDocuments(new Document("applicant.key",a.getString("key"))),p.get("total",Number.class).longValue());
            var item=p.getList("items",Document.class).getFirst();assertEquals(a.getString("key"),item.get("applicant",Document.class).getString("key"));assertNotNull(item.get("sources"));
            assertTrue(page("evaluations?correlativo="+id.substring(0,10)).getList("items",Document.class).isEmpty());
        }
        var first=page("evaluations?entryYear=2024&limit=1&offset=0");var next=page("evaluations?entryYear=2024&limit=1&offset=1");
        assertNotEquals(first.getList("items",Document.class).getFirst().getString("evaluationId"),next.getList("items",Document.class).getFirst().getString("evaluationId"));
        var e=first.getList("items",Document.class).getFirst();String career=e.get("career",Document.class).getString("key");String subject=e.get("subject",Document.class).getString("key");
        var filtered=page("evaluations?entryYear=2024&careerKey="+career+"&subjectKey="+subject);
        assertEquals(mongo.getCollection("evaluations").countDocuments(new Document("entryYear",2024).append("career.key",career).append("subject.key",subject)),filtered.get("total",Number.class).longValue());
        assertTrue(page("evaluations?entryYear=9999").getList("items",Document.class).isEmpty());
    }
    @Test void rejectsInvalidParametersAndControlsConnectionErrors() throws Exception {
        for(String path:List.of("options","options?dimension=wrong","options?dimension=career&departmentKey="+"0".repeat(64),"evaluations?entryYear=0","evaluations?limit=101","evaluations?offset=-1","evaluations?careerKey=bad","evaluations?identityScheme=full32"))assertEquals(400,get(path).statusCode(),path);
        doThrow(new IllegalStateException("private credentials")).when(repository).search(any(),any());
        var failure=get("evaluations");assertEquals(503,failure.statusCode());assertFalse(failure.body().contains("private"));
    }
}
