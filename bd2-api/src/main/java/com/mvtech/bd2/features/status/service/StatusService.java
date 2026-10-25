package com.mvtech.bd2.features.status.service;

import com.mvtech.bd2.features.status.dto.StatusResponse;
import org.bson.Document;
import org.neo4j.driver.Driver;
import org.neo4j.driver.TransactionConfig;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

import static com.mvtech.bd2.features.status.dto.StatusResponse.State.*;

@Service
public class StatusService {

    private final MongoTemplate mongoTemplate;
    private final Driver neo4jDriver;

    public StatusService(MongoTemplate mongoTemplate, Driver neo4jDriver) {
        this.mongoTemplate = mongoTemplate;
        this.neo4jDriver = neo4jDriver;
    }

    public StatusResponse check(String target) {
        return new StatusResponse(UP,
                target.equals("neo4j") ? NOT_CHECKED : checkMongo(),
                target.equals("mongodb") ? NOT_CHECKED : checkNeo4j());
    }

    private StatusResponse.State checkMongo() {
        try {
            // ping no exige autenticación, por eso también se comprueba la sesión
            Document status = mongoTemplate.executeCommand(new Document("connectionStatus", 1));
            boolean authenticated = !status.get("authInfo", Document.class)
                    .getList("authenticatedUsers", Document.class).isEmpty();
            double ping = mongoTemplate.executeCommand(new Document("ping", 1)).getDouble("ok");
            return authenticated && ping == 1.0 ? UP : DOWN;
        } catch (RuntimeException exception) {
            // Cada motor falla de forma independiente y no se expone la excepción del driver
            return DOWN;
        }
    }

    private StatusResponse.State checkNeo4j() {
        try (var session = neo4jDriver.session()) {
            var timeout = TransactionConfig.builder().withTimeout(Duration.ofSeconds(3)).build();
            return session.run("RETURN 1 AS connected", timeout)
                    .single().get("connected").asInt() == 1 ? UP : DOWN;
        } catch (RuntimeException exception) {
            return DOWN;
        }
    }
}
