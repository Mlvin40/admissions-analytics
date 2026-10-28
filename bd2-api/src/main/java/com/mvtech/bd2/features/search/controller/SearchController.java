package com.mvtech.bd2.features.search.controller;

import com.mvtech.bd2.features.search.dto.SearchDtos.*;
import com.mvtech.bd2.features.search.service.SearchService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/search")
public class SearchController {
    private final SearchService service;
    public SearchController(SearchService service) { this.service = service; }
    @GetMapping("/evaluations")
    public ResultsPage search(@Valid @ModelAttribute Filter filter) { return service.search(filter); }
    @GetMapping("/options")
    public OptionsPage options(@Valid @ModelAttribute LookupFilter filter) { return service.options(filter); }
    @ExceptionHandler({BindException.class,HandlerMethodValidationException.class})
    public ResponseEntity<ApiError> invalid() { return ResponseEntity.badRequest().body(new ApiError("INVALID_PARAMETERS","Revise los filtros, claves y límites de búsqueda")); }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> controlled(ResponseStatusException e) { return ResponseEntity.status(e.getStatusCode()).body(new ApiError("SEARCH_REQUEST_ERROR",e.getReason())); }
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiError> unavailable() { return ResponseEntity.status(503).body(new ApiError("SEARCH_UNAVAILABLE","No se pudo consultar MongoDB; vuelva a intentarlo")); }
}
