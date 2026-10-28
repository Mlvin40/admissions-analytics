package com.mvtech.bd2.features.graph.dto;

import jakarta.validation.constraints.*;

public record GraphFilter(
        @NotNull @Min(1) @Max(9999) Integer entryYear,
        @Size(max = 4102) @Pattern(regexp = "full32:[0-9a-f]{32}|short:[0-9a-f]{20,23}|other:.{1,4096}") String applicantKey,
        @Pattern(regexp = "[0-9a-f]{64}") String subjectKey,
        @Pattern(regexp = "[0-9a-f]{64}") String careerKey,
        @Pattern(regexp = "[0-9a-f]{64}") String departmentKey,
        @Pattern(regexp = "[0-9a-f]{64}") String municipalityKey,
        @Min(0) @Max(10000) Integer offset,
        @Min(1) @Max(100) Integer limit) {
    public int pageOffset() { return offset == null ? 0 : offset; }
    public int pageLimit() { return limit == null ? 25 : limit; }
}
