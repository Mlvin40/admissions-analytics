package com.mvtech.bd2;

import com.mongodb.client.MongoClient;
import com.mvtech.bd2.features.analytics.dto.AnalyticsFilter;
import com.mvtech.bd2.features.analytics.dto.AnalyticsDtos.*;
import com.mvtech.bd2.features.analytics.repository.*;
import com.mvtech.bd2.features.analytics.service.AnalyticsService;
import org.bson.Document;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.MongoTemplate;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "bd2.import-directory=${java.io.tmpdir}/bd2-analytics-fixtures-${random.uuid}")
class AnalyticsPipelinesTests {
    @Autowired MongoClient client;
    MongoTemplate fixture;
    AnalyticsRepository repository;
    AnalyticsService service;

    static AnalyticsFilter filter(Integer year) {
        return new AnalyticsFilter(year,null,null,null,null,null,null,null,null,null,null,null,null,null,0,100,null,null,null);
    }
    static AnalyticsFilter history(String identity, String cursor, int limit) {
        return new AnalyticsFilter(null,null,null,null,null,null,null,null,null,null,null,null,identity,null,0,limit,null,null,cursor);
    }
    private Document dimension(String id, String name, boolean known) {
        return new Document("key",id).append("name",name).append("sourceValue",name).append("known",known);
    }
    private Document evaluation(int id, String applicant, String career, String subject, Integer year,
                                Integer age, Integer opportunity, Boolean passed, boolean validDate) {
        return new Document("_id",String.format("%064x",id))
                .append("applicant",new Document("key","other:"+applicant).append("correlativo_aspirante",applicant).append("identityScheme","other"))
                .append("career",dimension(career,career,!career.equals("UNKNOWN")))
                .append("subject",dimension(subject,subject,true))
                .append("origin",new Document("department",dimension("D","DEP",true))
                        .append("municipality",dimension("D:M","MUNI",true).append("departmentKey","D"))
                        .append("institutionType",dimension("PUB","PUBLICO",true)))
                .append("entryYear",year).append("birthYear",age==null?null:year-age).append("entryAge",age)
                .append("assignmentDate",validDate?Date.from(Instant.parse((year-1)+"-08-01T00:00:00Z")):null)
                .append("opportunity",opportunity).append("passed",passed).append("sex","F")
                .append("sources",List.of(new Document("fileSha256","fixture").append("recordNumber",id).append("schemaId","full-headers")
                        .append("fileYear",year).append("sourceValues",new Document("correlativo_aspirante",applicant))))
                .append("qualityIssues",List.of()).append("graphSyncState","SYNCED");
    }
    @BeforeEach void setup() {
        fixture=new MongoTemplate(client,"bd2_analytics_test_"+UUID.randomUUID().toString().replace("-",""));
        repository=new AnalyticsRepository(fixture,new AnalyticsPipelines()); service=new AnalyticsService(repository);
        fixture.getCollection("evaluations").insertMany(List.of(
                evaluation(1,"a","C1","MATH",2020,17,2,false,true),
                evaluation(2,"a","C1","MATH",2020,17,4,true,true),
                evaluation(3,"a","C1","MATH",2021,null,1,false,true),
                evaluation(4,"b","C1","MATH",2020,18,1,false,false),
                evaluation(5,"b","C1","COMP",2020,18,1,true,true),
                evaluation(6,"c","UNKNOWN","COMP",2020,115,3,null,true),
                evaluation(7,"d","C2","COMP",2020,19,null,null,true)));
    }
    @AfterEach void cleanup() {
        // Solo se elimina la base sintética creada por esta prueba, nunca la base configurada ni evaluaciones originales
        fixture.getDb().drop();
    }
    @Test void allTwentyQueriesExecuteWithTypedResults() {
        for (AnalyticsQuery query:AnalyticsQuery.values()) {
            if(query==AnalyticsQuery.M06) { assertEquals(3,service.refresh().careerCount()); }
            if(query==AnalyticsQuery.M11) assertEquals(3,service.history(query,history("a",null,100),PerformanceRow.class).total());
            else if(query==AnalyticsQuery.M15) {
                var page=service.history(query,history("a",null,100),HistoryRow.class);
                assertEquals(3,page.total());assertEquals("a",page.items().getFirst().applicant().correlativo_aspirante());
                assertNotNull(page.items().getFirst().sources());
            } else {
                var page=service.metrics(query,filter(null));
                assertFalse(page.items().isEmpty(),query.name());assertEquals(query.name(),page.query());
            }
        }
    }
    @Test void uniqueApplicantsOutcomesAndZeroDenominatorsAreDistinct() {
        assertEquals(4,service.metrics(AnalyticsQuery.M01,filter(null)).items().getFirst().applicantCount());
        var rates=service.metrics(AnalyticsQuery.M04,filter(null)).items();
        var math=rates.stream().filter(r->r.group().subject().key().equals("MATH")).findFirst().orElseThrow();
        assertEquals(4,math.evaluationCount());assertEquals(1,math.approvedCount());assertEquals(25.0,math.approvalRate());
        var unknown=service.metrics(AnalyticsQuery.M20,filter(2020)).items().getFirst();
        assertEquals(2,unknown.unknownOutcomeCount());
        fixture.getCollection("evaluations").insertOne(evaluation(8,"e","C3","NEW",2020,null,1,null,true));
        var row=service.metrics(AnalyticsQuery.M04,filter(null)).items().stream().filter(r->r.group().subject().key().equals("NEW")).findFirst().orElseThrow();
        assertNull(row.approvalRate());assertEquals(0,row.knownOutcomeCount());
    }
    @Test void ageRepresentativeIsLatestEvenWhenAgeIsMissingAndCyclesResetAttempts() {
        var ages=service.metrics(AnalyticsQuery.M05,filter(null)).items();
        var career=ages.stream().filter(r->r.group().career().key().equals("C1")).findFirst().orElseThrow();
        assertEquals(18.0,career.meanAge());assertEquals(1,career.ageSampleCount());assertEquals(1,career.excludedAgeApplicantCount());
        var scoped=service.metrics(AnalyticsQuery.M05,filter(2020)).items().stream().filter(r->r.group().career().key().equals("C1")).findFirst().orElseThrow();
        assertEquals(17.5,scoped.meanAge());
        var attempts=service.metrics(AnalyticsQuery.M14,filter(null)).items();
        var math=attempts.stream().filter(r->r.group().subject().key().equals("MATH")).findFirst().orElseThrow();
        assertEquals(4.0/3.0,math.meanAttempts(),0.000001);assertEquals(3,math.applicantCycleCount());
        var comp=attempts.stream().filter(r->r.group().subject().key().equals("COMP")).findFirst().orElseThrow();
        assertEquals(1.0,comp.meanAttempts());assertEquals(1,comp.excludedAttemptGroups());
        assertEquals(1,service.metrics(AnalyticsQuery.M09,filter(null)).excludedEvaluations());
        assertEquals(2,service.metrics(AnalyticsQuery.M13,filter(null)).excludedEvaluations());
    }
    @Test void historyCursorDoesNotRepeatOrJoinIdentifierPrefixes() {
        var first=service.history(AnalyticsQuery.M15,history("a",null,1),HistoryRow.class);
        assertEquals(1,first.items().size());assertNotNull(first.nextCursor());
        var second=service.history(AnalyticsQuery.M15,history("a",first.nextCursor(),1),HistoryRow.class);
        assertNotEquals(first.items().getFirst().evaluationId(),second.items().getFirst().evaluationId());
        assertEquals(0,service.history(AnalyticsQuery.M11,history("a-prefix",null,10),PerformanceRow.class).total());
    }
    @Test void summaryRebuildDetectsStalenessUpdatesAndPreservesEvaluationDocuments() {
        var first=service.refresh();assertFalse(first.summary().refreshRequired());
        var before=fixture.getCollection("evaluations").find().into(new ArrayList<>());
        fixture.getCollection("evaluations").insertOne(evaluation(8,"x","C4","NEW",2022,18,1,true,true));
        assertTrue(service.metrics(AnalyticsQuery.M06,filter(null)).summary().refreshRequired());
        var next=service.refresh();assertEquals(4,next.careerCount());assertEquals(8,next.summary().sourceEvaluationCount());
        assertFalse(service.metrics(AnalyticsQuery.M06,filter(null)).summary().refreshRequired());
        assertEquals(before,fixture.getCollection("evaluations").find(new Document("_id",new Document("$ne",String.format("%064x",8)))).into(new ArrayList<>()));
        fixture.getCollection("evaluations").deleteMany(new Document());
        assertEquals(0,service.refresh().careerCount());
        assertTrue(service.metrics(AnalyticsQuery.M06,filter(null)).items().isEmpty());
    }
}
