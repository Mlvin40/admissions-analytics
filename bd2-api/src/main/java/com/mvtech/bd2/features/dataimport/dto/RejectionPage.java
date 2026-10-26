package com.mvtech.bd2.features.dataimport.dto;

import java.util.List;

public record RejectionPage(List<Rejection> items, int offset, int limit, long total) {
    public record Rejection(long recordNumber, String reason, List<String> values) { }
}
