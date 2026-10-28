package com.mvtech.bd2.features.graph.dto;

import java.time.LocalDate;
import java.util.List;

public final class GraphDtos {
    private GraphDtos() { }
    public record Dimension(String key, String name, String sourceValue) { }
    public record Evaluation(String key, LocalDate assignmentDate, Integer entryYear, Integer opportunity, Boolean passed) { }
    public record HistoryRow(String applicantKey, Evaluation evaluation, Dimension subject, Dimension career) { }
    public record ApprovalRow(Dimension subject, Dimension career, long evaluationCount, long approvedCount,
                              long failedCount, long unknownOutcomeCount, Double approvalRate) { }
    public record DemandRow(Dimension career, long applicantCount) { }
    public record ProgressionRow(String applicantKey, Dimension subject, Evaluation failed, Evaluation passed) { }
    public record PeerPath(String applicantKey, String evaluationKey, String municipalityKey,
                           String peerEvaluationKey, String peerApplicantKey) { }
    public record NodeProperties(String name, String sourceValue, String departmentKey,
                                 String correlativo_aspirante, String identityScheme,
                                 Integer entryYear, LocalDate assignmentDate, Integer opportunity, Boolean passed, Integer entryAge) { }
    public record GraphNode(String id, String label, String key, NodeProperties properties) { }
    public record GraphEdge(String id, String source, String target, String type) { }
    public record GraphData(List<GraphNode> nodes, List<GraphEdge> edges) { }
    public record Page<T>(String query, String unit, int offset, int limit, boolean hasMore,
                          List<T> items, GraphData graph, List<String> notes, long databaseMs, long executionMs) { }
    public record ApiError(String code, String message) { }
}
