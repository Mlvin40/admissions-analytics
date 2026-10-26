package com.mvtech.bd2.features.dataimport.dto;

import org.bson.Document;

public record ImportResult(String id, String fileName, String status, long totalRead, long valid,
        long processed, long rejected, long pending, long mongoStored, long newEvaluations,
        long alreadyExisting, long duplicates, long elapsedMs, int attempt, String message) {
    public static long number(Document document, String name) {
        Object value = document.get(name);
        return value instanceof Number n ? n.longValue() : 0;
    }

    public static ImportResult from(Document document) {
        long valid = number(document, "valid");
        long processed = number(document, "processed");
        long elapsed = number(document, "elapsedMs");
        if ("RUNNING".equals(document.getString("status"))) {
            elapsed = Math.max(elapsed, System.currentTimeMillis() - number(document, "startedAt"));
        }
        return new ImportResult(document.getString("id"), document.getString("fileName"),
                document.getString("status"), number(document, "totalRead"), valid, processed,
                number(document, "rejected"), valid - processed, number(document, "mongoStored"),
                number(document, "newEvaluations"), number(document, "alreadyExisting"),
                number(document, "duplicates"), elapsed, (int) number(document, "attempt"),
                document.getString("message"));
    }
}
