package com.mvtech.bd2.features.status.controller;

import com.mvtech.bd2.features.status.dto.StatusResponse;
import com.mvtech.bd2.features.status.service.StatusService;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

@RestController
public class StatusController {

    private final StatusService statusService;

    public StatusController(StatusService statusService) {
        this.statusService = statusService;
    }

    @GetMapping("/api/status")
    public ResponseEntity<StatusResponse> status(
            @RequestParam(defaultValue = "all")
            @Pattern(regexp = "all|mongodb|neo4j") String target) {
        StatusResponse result = statusService.check(target);
        return ResponseEntity.status(result.available() ? 200 : 503).body(result);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiError> invalidTarget() {
        return ResponseEntity.badRequest().body(new ApiError("Seleccione all, mongodb o neo4j como target"));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiError> unexpectedError() {
        return ResponseEntity.internalServerError().body(new ApiError("No se pudo comprobar el estado del servicio"));
    }

    public record ApiError(String message) { }
}
