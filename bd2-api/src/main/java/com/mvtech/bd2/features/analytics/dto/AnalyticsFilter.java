package com.mvtech.bd2.features.analytics.dto;

import jakarta.validation.constraints.*;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;

public record AnalyticsFilter(
        @Min(1) @Max(9999) Integer entryYear,
        @Pattern(regexp = "[0-9a-f]{64}") String careerKey,
        @Pattern(regexp = "[0-9a-f]{64}") String subjectKey,
        @Pattern(regexp = "[0-9a-f]{64}") String institutionTypeKey,
        @Pattern(regexp = "[0-9a-f]{64}") String departmentKey,
        @Pattern(regexp = "[0-9a-f]{64}") String municipalityKey,
        @Size(max = 4096) String sex, Boolean passed,
        @Min(0) @Max(100) Integer minAge, @Min(0) @Max(100) Integer maxAge,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate assignmentFrom,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate assignmentTo,
        @Size(max = 4096) String correlativo,
        @Pattern(regexp = "full32|short|other") String identityScheme,
        @Min(0) @Max(1000000) Integer offset, @Min(1) @Max(100) Integer limit,
        @Pattern(regexp = "key|count|rate|age|attempts") String sort,
        @Pattern(regexp = "asc|desc") String direction,
        @Size(max = 1024) String cursor) {
    public int pageOffset() { return offset == null ? 0 : offset; }
    public int pageLimit() { return limit == null ? 25 : limit; }
}
