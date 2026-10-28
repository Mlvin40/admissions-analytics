package com.mvtech.bd2.features.analytics.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class AnalyticsDtos {
    private AnalyticsDtos() { }
    public record Dimension(String key, String name, String sourceValue, Boolean known, String departmentKey) { }
    public record Group(Dimension career, Dimension subject, Dimension institutionType, Dimension department,
                        Dimension municipality, Integer entryYear, String month, Integer age, String sex) { }
    public record MetricRow(Group group, Long applicantCount, Long evaluationCount, Long approvedCount,
            Long failedCount, Long unknownOutcomeCount, Long knownOutcomeCount, Double approvalRate,
            Double failureRate, Double meanAge, Long ageSampleCount, Long excludedAgeApplicantCount,
            Double meanAttempts, Long applicantCycleCount, Long excludedAttemptGroups, Long rank,
            Long applicantsWithApproval) { }
    public record SummaryInfo(Instant generatedAt, String sourceSnapshot, long sourceEvaluationCount,
                              boolean refreshRequired) { }
    public record Page<T>(String query, String unit, int offset, int limit, long total,
            long excludedEvaluations, String nextCursor, List<T> items, List<String> notes,
            SummaryInfo summary, long executionMs) { }
    public record Applicant(String key, String correlativo_aspirante, String identityScheme) { }
    public record Origin(Dimension department, Dimension municipality, Dimension institutionType) { }
    public record Source(String fileSha256, long recordNumber, Integer fileYear, String schemaId,
                         Map<String, String> sourceValues) { }
    public record PerformanceRow(String evaluationId, String applicantKey, Dimension subject, Dimension career,
            Integer entryYear, Integer opportunity, Boolean passed, Instant assignmentDate) { }
    public record HistoryRow(String evaluationId, Applicant applicant, Instant assignmentDate,
            Integer entryYear, Integer birthYear, String sex, Integer opportunity, Boolean passed,
            Integer entryAge, Dimension subject, Dimension career, Origin origin,
            List<String> qualityIssues, List<Source> sources) { }
    public record RefreshResult(long careerCount, SummaryInfo summary) { }
    public record ApiError(String code, String message) { }
}
