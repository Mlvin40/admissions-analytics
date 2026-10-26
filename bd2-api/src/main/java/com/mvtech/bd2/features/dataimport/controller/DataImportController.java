package com.mvtech.bd2.features.dataimport.controller;

import com.mvtech.bd2.features.dataimport.dto.ImportResult;
import com.mvtech.bd2.features.dataimport.dto.RejectionPage;
import com.mvtech.bd2.features.dataimport.service.DataImportService;
import com.mvtech.bd2.features.dataimport.service.ImportFileStore;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.List;

@RestController
@RequestMapping("/api/imports")
public class DataImportController {
    private final DataImportService service;
    private final ImportFileStore files;

    public DataImportController(DataImportService service, ImportFileStore files) {
        this.service = service; this.files = files;
    }

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<List<ImportResult>> upload(@RequestParam("files") MultipartFile[] uploads) throws IOException {
        return ResponseEntity.accepted().body(service.submit(uploads));
    }

    @GetMapping
    public List<ImportResult> list(@RequestParam(defaultValue = "0") @Min(0) int offset,
                                  @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit) throws IOException {
        return files.list(offset, limit).stream().map(ImportResult::from).toList();
    }

    @GetMapping("/{id}")
    public ImportResult result(@PathVariable String id) throws IOException { return ImportResult.from(files.read(id)); }

    @PostMapping("/{id}/retry")
    public ResponseEntity<ImportResult> retry(@PathVariable String id) throws IOException {
        return ResponseEntity.accepted().body(service.retry(id));
    }

    @GetMapping("/{id}/rejections")
    public RejectionPage rejections(@PathVariable String id, @RequestParam(defaultValue = "0") @Min(0) int offset,
                                   @RequestParam(defaultValue = "25") @Min(1) @Max(100) int limit) throws IOException {
        return files.rejections(id, offset, limit);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> invalid(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiError> validation() { return ResponseEntity.badRequest().body(new ApiError("Paginación inválida")); }

    @ExceptionHandler(NoSuchFileException.class)
    public ResponseEntity<ApiError> missing() { return ResponseEntity.status(404).body(new ApiError("Importación no encontrada")); }

    @ExceptionHandler({IOException.class, RuntimeException.class})
    public ResponseEntity<ApiError> unavailable() {
        return ResponseEntity.status(503).body(new ApiError("No se pudo acceder a la importación; vuelva a intentarlo"));
    }

    public record ApiError(String message) { }
}
