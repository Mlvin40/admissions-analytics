package com.mvtech.bd2.features.graph.repository;

public enum GraphQueries {
    N01("applicant-history", "EVALUATIONS"),
    N02("approval-by-subject-career", "EVALUATIONS"),
    N03("top-careers-by-department", "APPLICANTS"),
    N04("improved-outcomes", "OBSERVED_EVALUATION_PAIRS"),
    N05("municipality-peers", "OBSERVED_PATHS");

    private final String path;
    private final String unit;
    GraphQueries(String path, String unit) { this.path = path; this.unit = unit; }
    public String path() { return path; }
    public String unit() { return unit; }
}
