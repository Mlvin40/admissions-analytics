package com.mvtech.bd2;

import org.bson.Document;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.neo4j.driver.Driver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.MongoTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "bd2.import-directory=${java.io.tmpdir}/bd2-context-${random.uuid}")
class Bd2ApiApplicationTests {

    @LocalServerPort
    private int port;

    @Test
    void statusEndpointReturnsRealConnections() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/status")).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            Document body = Document.parse(response.body());
            assertEquals("UP", body.getString("api"));
            assertEquals("UP", body.getString("mongodb"));
            assertEquals("UP", body.getString("neo4j"));
        }
    }

    @Test
    void invalidTargetReturnsControlledBadRequest() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/status?target=invalid")).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(400, response.statusCode());
            assertEquals("Seleccione all, mongodb o neo4j como target", Document.parse(response.body()).getString("message"));
        }
    }

	@Autowired
	private MongoTemplate mongoTemplate;

	@Autowired
	private Driver neo4jDriver;

	@Test
	void mongoAcceptsAuthenticatedCommands() {
		// ping por sí solo no demuestra autenticación en MongoDB
		Document status = mongoTemplate.executeCommand(new Document("connectionStatus", 1));
		Document authInfo = status.get("authInfo", Document.class);
		assertFalse(authInfo.getList("authenticatedUsers", Document.class).isEmpty());
		assertEquals(1.0, mongoTemplate.executeCommand(new Document("ping", 1)).getDouble("ok"));
	}

	@Test
	void neo4jAcceptsAuthenticatedQueries() {
		neo4jDriver.verifyConnectivity();
		try (var session = neo4jDriver.session()) {
			// Consulta de lectura constante sin crear nodos ni relaciones
			assertEquals(1, session.run("RETURN 1 AS connected").single().get("connected").asInt());
		}
	}

}
