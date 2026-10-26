package com.mvtech.bd2;

import com.mvtech.bd2.features.dataimport.service.EvaluationTransformer;
import org.apache.commons.csv.CSVFormat;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class EvaluationTransformerTests {
    private final EvaluationTransformer transformer = new EvaluationTransformer();

    static Map<String, String> source() throws Exception {
        try (var reader = new java.io.InputStreamReader(new ClassPathResource("dataimport/full-headers.csv").getInputStream(), StandardCharsets.UTF_8);
             var csv = CSVFormat.RFC4180.builder().setHeader().get().parse(reader)) {
            return new LinkedHashMap<>(csv.iterator().next().toMap());
        }
    }

    @Test
    void keepsSpecialValuesAndOriginalContextWithoutInventingAge() throws Exception {
        var values = source();
        Document result = transformer.transform(values, "hash", 2015, "full-headers", 1);
        assertNull(result.get("birthYear")); assertNull(result.get("entryAge"));
        assertEquals(false, result.get("passed"));
        assertEquals(false, result.get("career", Document.class).get("known"));
        assertEquals(values, result.getList("sources", Document.class).getFirst().get("sourceValues"));
        assertEquals("full32:" + values.get("correlativo_aspirante"), result.get("applicant", Document.class).get("key"));
    }

    @Test
    void identifiersAreStableAndNeverMergePrefixesOrTrailingCareerSpaces() throws Exception {
        var values = source();
        String id = transformer.transform(values, "first-file", 2015, "full-headers", 1).getString("_id");
        assertEquals(id, transformer.transform(values, "other-file", 2024, "short-headers", 9).getString("_id"));
        values.put("correlativo_aspirante", values.get("correlativo_aspirante").substring(0, 20));
        Document shorter = transformer.transform(values, "f", 2022, "short-headers", 1);
        assertNotEquals(id, shorter.getString("_id"));
        assertTrue(shorter.get("applicant", Document.class).getString("key").startsWith("short:"));
        values.put("carrera_objetivo", "INGENIERIA MECANICA");
        Document career = transformer.transform(values, "f", 2022, "short-headers", 1).get("career", Document.class);
        values.put("carrera_objetivo", "INGENIERIA MECANICA ");
        Document incomplete = transformer.transform(values, "f", 2022, "short-headers", 1).get("career", Document.class);
        assertEquals(career.getString("name"), incomplete.getString("name"));
        assertNotEquals(career.getString("key"), incomplete.getString("key"));
    }

    @Test
    void invalidDatesNumbersAndUnknownOutcomeRemainAuditable() throws Exception {
        var values = source();
        values.put("fecha_asignacion", "2023-02-30"); values.put("anio_nacimiento", "1900");
        values.put("numero_de_fecha_de_evaluacion", "bad"); values.put("aprobacion", "OTRO");
        Document result = transformer.transform(values, "f", 2015, "full-headers", 1);
        assertNull(result.get("assignmentDate")); assertNull(result.get("entryAge"));
        assertEquals(1900, result.getInteger("birthYear"));
        assertNull(result.get("opportunity")); assertNull(result.get("passed"));
        assertTrue(result.getList("qualityIssues", String.class).containsAll(List.of("INVALID_ASSIGNMENT_DATE", "AGE_OUTSIDE_POLICY", "UNKNOWN_OUTCOME", "INVALID_OPPORTUNITY")));
        values.put("correlativo_aspirante", " ");
        assertThrows(IllegalArgumentException.class, () -> transformer.transform(values, "f", 2015, "full-headers", 1));
    }
}
