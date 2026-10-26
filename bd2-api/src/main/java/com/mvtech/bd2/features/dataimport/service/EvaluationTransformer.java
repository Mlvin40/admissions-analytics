package com.mvtech.bd2.features.dataimport.service;

import org.bson.Document;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.*;

@Component
public class EvaluationTransformer {
    public static final List<String> FIELDS = List.of("fecha_asignacion", "sexo", "anio_nacimiento",
            "materia", "numero_de_fecha_de_evaluacion", "anio_de_ingreso", "aprobacion", "carrera_objetivo",
            "departamento_institucion_educativa", "municipio_institucion_educativa",
            "tipo_institucion_educativa", "correlativo_aspirante");
    public static final Map<String, String> ALIASES = Map.of(
            "numero_de_fecha_de_evaluaci", "numero_de_fecha_de_evaluacion",
            "departamento_institucion_ed", "departamento_institucion_educativa",
            "municipio_institucion_", "municipio_institucion_educativa");
    private static final Set<String> RAW_DIMENSIONS = Set.of("carrera_objetivo",
            "departamento_institucion_educativa", "municipio_institucion_educativa");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuu-MM-dd")
            .withResolverStyle(ResolverStyle.STRICT);

    public static String hash(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 no disponible", exception);
        }
    }

    public static String key(Object... values) {
        return hash(JSON.writeValueAsString(Arrays.asList(values)).getBytes(StandardCharsets.UTF_8));
    }

    private static String nfc(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFC);
    }

    private static String token(String value) {
        return nfc(value.strip()).toUpperCase(Locale.ROOT);
    }

    private static boolean known(String value) {
        return !Set.of("", "SIN REGISTRO", "SIN DATOS", "NINGUNO").contains(token(value));
    }

    private static Integer positive(String value) {
        try {
            return value.matches("[0-9]+") && Integer.parseInt(value) > 0 ? Integer.valueOf(value) : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static Document dimension(String label, String source, String departmentKey) {
        String value = nfc(source);
        String id = label.equals("Municipality") ? key(label, departmentKey, value) : key(label, value);
        Document result = new Document("key", id).append("name", value.strip())
                .append("sourceValue", value).append("known", known(value));
        if (label.equals("Municipality")) result.append("departmentKey", departmentKey);
        return result;
    }

    public Document transform(Map<String, String> source, String fileHash, Integer fileYear,
                              String schemaId, long recordNumber) {
        if (source.values().stream().anyMatch(value -> value.length() > 4096 || value.indexOf('\0') >= 0)) {
            throw new IllegalArgumentException("Campo ilegible o superior a 4096 caracteres");
        }
        String identity = nfc(source.get("correlativo_aspirante").strip());
        if (identity.isBlank()) throw new IllegalArgumentException("correlativo_aspirante obligatorio");
        List<String> issues = new ArrayList<>();
        String scheme = identity.matches("[0-9a-f]{32}") ? "full32"
                : identity.matches("[0-9a-f]{20,23}") ? "short" : "other";
        if (scheme.equals("other")) issues.add("UNRECOGNIZED_IDENTIFIER_FORMAT");
        String applicantKey = scheme + ":" + identity;
        List<Object> fingerprint = new ArrayList<>(List.of("v1", applicantKey));
        for (String field : FIELDS) {
            String value = source.get(field);
            fingerprint.add(nfc(RAW_DIMENSIONS.contains(field) ? value : value.strip()));
        }
        String id = hash(JSON.writeValueAsString(fingerprint).getBytes(StandardCharsets.UTF_8));
        LocalDate assignment = null;
        String date = source.get("fecha_asignacion").strip();
        try {
            if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
            assignment = LocalDate.parse(date, DATE);
        } catch (RuntimeException exception) {
            issues.add("INVALID_ASSIGNMENT_DATE");
        }
        Integer entry = positive(source.get("anio_de_ingreso").strip());
        Integer opportunity = positive(source.get("numero_de_fecha_de_evaluacion").strip());
        String birthText = source.get("anio_nacimiento").strip();
        Integer birth = birthText.matches("[0-9]{4}") ? positive(birthText) : null;
        if (entry == null) issues.add("INVALID_ENTRY_YEAR");
        if (opportunity == null) issues.add("INVALID_OPPORTUNITY");
        if (birth == null) issues.add(known(birthText) ? "INVALID_BIRTH_YEAR" : "MISSING_BIRTH_YEAR");
        if (fileYear != null && entry != null && !fileYear.equals(entry)) issues.add("FILE_YEAR_MISMATCH");
        Integer age = birth != null && entry != null ? entry - birth : null;
        if (age != null && (age < 0 || age > 100 || (assignment != null && birth > assignment.getYear()))) {
            age = null;
            issues.add("AGE_OUTSIDE_POLICY");
        }
        String outcome = token(source.get("aprobacion"));
        Boolean passed = outcome.equals("APROBADO") ? Boolean.TRUE
                : outcome.equals("NO APROBADO") ? Boolean.FALSE : null;
        if (passed == null) issues.add("UNKNOWN_OUTCOME");
        String sexText = token(source.get("sexo"));
        String sex = known(sexText) ? sexText : null;
        if (sex == null) issues.add("UNKNOWN_SEX");
        Document career = dimension("Career", source.get("carrera_objetivo"), null);
        Document department = dimension("Department", source.get("departamento_institucion_educativa"), null);
        Document municipality = dimension("Municipality", source.get("municipio_institucion_educativa"),
                department.getBoolean("known") ? department.getString("key") : null);
        Document type = dimension("InstitutionType", token(source.get("tipo_institucion_educativa")), null);
        if (!career.getBoolean("known")) issues.add("UNKNOWN_CAREER");
        if (!department.getBoolean("known") || !municipality.getBoolean("known")) issues.add("UNKNOWN_ORIGIN");
        if (!type.getBoolean("known")) issues.add("UNKNOWN_INSTITUTION_TYPE");
        if (schemaId.equals("short-headers")) issues.add("SOURCE_TEXT_POSSIBLY_TRUNCATED");
        String subjectText = token(source.get("materia"));
        Document subject = known(subjectText) ? new Document("key", key("Subject", subjectText))
                .append("name", subjectText).append("known", true) : null;
        if (subject == null) issues.add("UNKNOWN_SUBJECT");
        Document provenance = new Document("fileSha256", fileHash).append("recordNumber", recordNumber)
                .append("fileYear", fileYear).append("schemaId", schemaId)
                .append("sourceValues", new Document(source));
        return new Document("_id", id)
                .append("applicant", new Document("key", applicantKey).append("correlativo_aspirante", identity)
                        .append("identityScheme", scheme))
                .append("assignmentDate", assignment == null ? null : Date.from(assignment.atStartOfDay(ZoneOffset.UTC).toInstant()))
                .append("entryYear", entry).append("birthYear", birth).append("sex", sex)
                .append("opportunity", opportunity).append("passed", passed).append("entryAge", age)
                .append("subject", subject).append("career", career)
                .append("origin", new Document("department", department).append("municipality", municipality).append("institutionType", type))
                .append("qualityIssues", issues).append("sources", List.of(provenance)).append("graphSyncState", "PENDING");
    }
}
