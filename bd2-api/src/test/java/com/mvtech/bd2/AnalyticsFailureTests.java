package com.mvtech.bd2;

import com.mvtech.bd2.features.analytics.repository.AnalyticsRepository;
import com.mvtech.bd2.features.analytics.service.AnalyticsService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AnalyticsFailureTests {
    @Test
    void concurrentImportDoesNotPublishAnInconsistentSummary() {
        var repository = mock(AnalyticsRepository.class);
        when(repository.fingerprint()).thenReturn(new AnalyticsRepository.Fingerprint(1, "before"),
                new AnalyticsRepository.Fingerprint(2, "after"));
        var failure = assertThrows(ResponseStatusException.class, () -> new AnalyticsService(repository).refresh());
        assertEquals(409, failure.getStatusCode().value());
        verify(repository, never()).publishSummary(any(), any(), anyString());
        verify(repository).discardStaging(startsWith("resumen_carrera_build_"));
    }
    @Test
    void failedAggregationPreservesPublishedSummaryAndCleansItsOwnStaging() {
        var repository = mock(AnalyticsRepository.class);
        when(repository.fingerprint()).thenReturn(new AnalyticsRepository.Fingerprint(1, "before"));
        doThrow(new IllegalStateException("connection unavailable")).when(repository).buildSummary(any(), any(), anyString());
        assertThrows(IllegalStateException.class, () -> new AnalyticsService(repository).refresh());
        verify(repository, never()).publishSummary(any(), any(), anyString());
        verify(repository).discardStaging(startsWith("resumen_carrera_build_"));
    }
}
