package com.mvtech.bd2.features.search.dto;

import com.mvtech.bd2.features.analytics.dto.AnalyticsDtos.HistoryRow;
import jakarta.validation.constraints.*;
import java.util.List;

public final class SearchDtos {
    private SearchDtos() { }
    public record Filter(@Size(max=4096) String correlativo,
            @Pattern(regexp="full32|short|other") String identityScheme,
            @Pattern(regexp="[0-9a-f]{64}") String careerKey,
            @Pattern(regexp="[0-9a-f]{64}") String subjectKey,
            @Pattern(regexp="[0-9a-f]{64}") String departmentKey,
            @Pattern(regexp="[0-9a-f]{64}") String municipalityKey,
            @Pattern(regexp="[0-9a-f]{64}") String institutionTypeKey,
            @Min(1) @Max(9999) Integer entryYear,
            @Min(0) @Max(1000000) Integer offset, @Min(1) @Max(100) Integer limit) {
        public int pageOffset() { return offset == null ? 0 : offset; }
        public int pageLimit() { return limit == null ? 25 : limit; }
    }
    public record LookupFilter(@NotNull @Pattern(regexp="career|subject|department|municipality|institutionType") String dimension,
            @Size(max=100) String q, @Pattern(regexp="[0-9a-f]{64}") String key,
            @Pattern(regexp="[0-9a-f]{64}") String departmentKey,
            @Min(0) @Max(10000) Integer offset, @Min(1) @Max(100) Integer limit) {
        public int pageOffset() { return offset == null ? 0 : offset; }
        public int pageLimit() { return limit == null ? 50 : limit; }
    }
    public record Option(String key, String name, String sourceValue, Boolean known, String departmentKey, String contextName) { }
    public record OptionsPage(List<Option> items, long total, int offset, int limit) { }
    public record ResultsPage(List<HistoryRow> items, long total, int offset, int limit) { }
    public record ApiError(String code, String message) { }
}
