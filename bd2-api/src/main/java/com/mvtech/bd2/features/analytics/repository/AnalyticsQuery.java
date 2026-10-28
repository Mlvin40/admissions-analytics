package com.mvtech.bd2.features.analytics.repository;

import java.util.Arrays;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public enum AnalyticsQuery {
    M01("applicants-by-institution-type", "APPLICANTS", "count"),
    M02("approvals-by-subject", "EVALUATIONS", "count"),
    M03("approved-applicants-by-career-year", "APPLICANTS", "count"),
    M04("approval-rate-by-subject", "EVALUATIONS", "rate"),
    M05("mean-age-by-career", "APPLICANT_AGES", "age"),
    M06("career-summary", "CAREER_SUMMARY", "count"),
    M07("mean-age-approved-by-career-institution", "APPLICANT_AGES", "age"),
    M08("approved-applicants-by-municipality-career", "APPLICANTS", "count"),
    M09("public-evaluations-by-month-subject", "EVALUATIONS", "key"),
    M10("top-careers-age-16-18", "APPLICANTS", "count"),
    M11("applicant-performance", "EVALUATIONS", "key"),
    M12("applicants-by-sex-institution", "APPLICANTS", "count"),
    M13("approval-rate-by-age", "EVALUATIONS", "rate"),
    M14("mean-observed-attempts-by-subject", "APPLICANT_CYCLE_SUBJECT", "attempts"),
    M15("applicant-history", "EVALUATIONS", "key"),
    M16("first-attempt-failures-by-career", "APPLICANTS", "count"),
    M17("top-municipalities", "APPLICANTS", "count"),
    M18("approval-rate-by-institution-type", "EVALUATIONS", "rate"),
    M19("career-demand-by-department", "APPLICANTS", "key"),
    M20("approval-evolution-by-entry-year", "EVALUATIONS", "key");

    private final String path;
    private final String unit;
    private final String defaultSort;
    AnalyticsQuery(String path, String unit, String defaultSort) {
        this.path = path; this.unit = unit; this.defaultSort = defaultSort;
    }
    public String path() { return path; }
    public String unit() { return unit; }
    public String defaultSort() { return defaultSort; }
    public static AnalyticsQuery fromPath(String path) {
        return Arrays.stream(values()).filter(query -> query.path.equals(path)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Consulta no encontrada"));
    }
}
