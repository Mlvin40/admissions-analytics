package com.mvtech.bd2.features.graph.controller;

import com.mvtech.bd2.features.graph.dto.GraphFilter;
import com.mvtech.bd2.features.graph.dto.GraphDtos.*;
import com.mvtech.bd2.features.graph.service.GraphService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/graph")
public class GraphController {
    private final GraphService service;
    public GraphController(GraphService service) { this.service = service; }
    @GetMapping("/applicant-history")
    public Page<HistoryRow> history(@Valid @ModelAttribute GraphFilter filter) { return service.history(filter); }
    @GetMapping("/approval-by-subject-career")
    public Page<ApprovalRow> approvals(@Valid @ModelAttribute GraphFilter filter) { return service.approvals(filter); }
    @GetMapping("/top-careers-by-department")
    public Page<DemandRow> demand(@Valid @ModelAttribute GraphFilter filter) { return service.demand(filter); }
    @GetMapping("/improved-outcomes")
    public Page<ProgressionRow> progressions(@Valid @ModelAttribute GraphFilter filter) { return service.progressions(filter); }
    @GetMapping("/municipality-peers")
    public Page<PeerPath> peers(@Valid @ModelAttribute GraphFilter filter) { return service.peers(filter); }

    @ExceptionHandler({BindException.class, HandlerMethodValidationException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> invalidParameters() {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_PARAMETERS", "Revise tipos, claves, ciclo, límites y paginación"));
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> controlled(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(new ApiError("GRAPH_REQUEST_ERROR", exception.getReason()));
    }
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiError> unavailable() {
        return ResponseEntity.status(503).body(new ApiError("GRAPH_UNAVAILABLE", "No se pudo completar la consulta a Neo4j; vuelva a intentarlo"));
    }
}
