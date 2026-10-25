package com.mvtech.bd2;

import com.mvtech.bd2.features.status.controller.StatusController;
import com.mvtech.bd2.features.status.service.StatusService;
import org.junit.jupiter.api.Test;
import org.neo4j.driver.Driver;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.dao.DataAccessResourceFailureException;

import static com.mvtech.bd2.features.status.dto.StatusResponse.State.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;
import org.bson.Document;
import java.util.List;

class StatusFailureTests {
    @Test
    void bothFailuresReturn503WithoutInternalDetails() {
        var mongo = mock(MongoTemplate.class);
        var neo4j = mock(Driver.class);
        when(mongo.executeCommand(any(Document.class))).thenThrow(new DataAccessResourceFailureException("private connection details"));
        when(neo4j.session()).thenThrow(new IllegalStateException("private credentials"));
        var response = new StatusController(new StatusService(mongo, neo4j)).status("all");
        assertEquals(503, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(UP, response.getBody().api());
        assertEquals(DOWN, response.getBody().mongodb());
        assertEquals(DOWN, response.getBody().neo4j());
        assertFalse(response.getBody().toString().contains("private"));
    }

    @Test
    void failedCheckCanRecoverAndDoesNotCheckUnselectedMotor() {
        var mongo = mock(MongoTemplate.class);
        var neo4j = mock(Driver.class);
        var authenticated = new Document("authInfo", new Document("authenticatedUsers", List.of(new Document("user", "test"))));
        when(mongo.executeCommand(any(Document.class)))
                .thenThrow(new DataAccessResourceFailureException("unavailable"))
                .thenReturn(authenticated, new Document("ok", 1.0));
        var service = new StatusService(mongo, neo4j);
        assertEquals(DOWN, service.check("mongodb").mongodb());
        var recovered = service.check("mongodb");
        assertEquals(UP, recovered.mongodb());
        assertEquals(NOT_CHECKED, recovered.neo4j());
        verifyNoInteractions(neo4j);
    }
}
