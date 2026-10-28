package com.mvtech.bd2.features.analytics.controller;

import com.mvtech.bd2.features.analytics.dto.AnalyticsFilter;
import com.mvtech.bd2.features.analytics.dto.AnalyticsDtos.*;
import com.mvtech.bd2.features.analytics.repository.AnalyticsQuery;
import com.mvtech.bd2.features.analytics.service.AnalyticsService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {
    private final AnalyticsService service;
    public AnalyticsController(AnalyticsService service) { this.service = service; }

    @GetMapping("/applicant-performance")
    public Page<PerformanceRow> performance(@Valid @ModelAttribute AnalyticsFilter filter) {
        return service.history(AnalyticsQuery.M11, filter, PerformanceRow.class);
    }
    @GetMapping("/applicant-history")
    public Page<HistoryRow> history(@Valid @ModelAttribute AnalyticsFilter filter) {
        return service.history(AnalyticsQuery.M15, filter, HistoryRow.class);
    }
    @PostMapping("/career-summary/refresh")
    public RefreshResult refresh() { return service.refresh(); }

    @GetMapping("/{query}")
    public Page<MetricRow> query(@PathVariable String query, @Valid @ModelAttribute AnalyticsFilter filter) {
        return service.metrics(AnalyticsQuery.fromPath(query), filter);
    }

    @ExceptionHandler({BindException.class, HandlerMethodValidationException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> invalidParameters() {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_PARAMETERS", "Revise tipos, rangos, filtros, paginación y ordenamiento"));
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> controlled(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(new ApiError("ANALYTICS_REQUEST_ERROR", exception.getReason()));
    }
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiError> unavailable() {
        return ResponseEntity.status(503).body(new ApiError("ANALYTICS_UNAVAILABLE", "No se pudo completar la consulta a MongoDB; vuelva a intentarlo"));
    }
}
