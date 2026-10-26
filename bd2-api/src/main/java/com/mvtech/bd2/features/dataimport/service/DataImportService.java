package com.mvtech.bd2.features.dataimport.service;

import com.mvtech.bd2.features.dataimport.dto.ImportResult;
import com.mvtech.bd2.features.dataimport.repository.GraphImportRepository;
import com.mvtech.bd2.features.dataimport.repository.MongoImportRepository;
import jakarta.annotation.PreDestroy;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.bson.Document;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

import static com.mvtech.bd2.features.dataimport.dto.ImportResult.number;

@Service
public class DataImportService {
    private static final int BATCH_SIZE = 250;
    private final ImportFileStore files;
    private final EvaluationTransformer transformer;
    private final MongoImportRepository mongo;
    private final GraphImportRepository graph;
    private final Set<String> active = ConcurrentHashMap.newKeySet();
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "csv-import-worker"); thread.setDaemon(true); return thread;
    });

    public DataImportService(ImportFileStore files, EvaluationTransformer transformer,
                             MongoImportRepository mongo, GraphImportRepository graph) {
        this.files = files; this.transformer = transformer; this.mongo = mongo; this.graph = graph;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recover() throws IOException {
        // El diario local sigue disponible si los motores fallan o el proceso termina entre confirmaciones
        int offset = 0;
        List<Document> page;
        do {
            page = files.list(offset, 100);
            for (Document job : page) {
                if ("RUNNING".equals(job.getString("status"))) {
                    job.put("status", "INTERRUPTED");
                    job.put("message", "Procesamiento interrumpido; reintente el archivo conservado");
                    files.write(job);
                } else if ("QUEUED".equals(job.getString("status"))) enqueue(job.getString("id"));
            }
            offset += page.size();
        } while (page.size() == 100);
    }

    public synchronized List<ImportResult> submit(MultipartFile[] uploads) throws IOException {
        if (uploads.length == 0 || uploads.length > 10) throw new IllegalArgumentException("Seleccione de uno a diez archivos CSV");
        if (active.size() + uploads.length > 20) throw new IllegalArgumentException("La cola está ocupada; espere a que finalicen las cargas");
        for (MultipartFile upload : uploads) {
            String name = Objects.requireNonNullElse(upload.getOriginalFilename(), "");
            if (!name.toLowerCase(Locale.ROOT).endsWith(".csv") || upload.isEmpty() || upload.getSize() > 16L * 1024 * 1024) {
                throw new IllegalArgumentException("Cada archivo debe ser CSV, no vacío y de hasta 16 MB");
            }
        }
        List<ImportResult> results = new ArrayList<>();
        for (MultipartFile upload : uploads) {
            Document job = files.create(upload);
            results.add(ImportResult.from(job));
            enqueue(job.getString("id"));
        }
        return results;
    }

    public synchronized ImportResult retry(String id) throws IOException {
        Document job = files.read(id);
        if (active.contains(id) || Set.of("RUNNING", "QUEUED").contains(job.getString("status"))) {
            throw new IllegalArgumentException("La importación ya está activa");
        }
        if (active.size() >= 20) throw new IllegalArgumentException("La cola está ocupada");
        if (!Files.isRegularFile(files.path(id, ".csv"))) throw new IllegalArgumentException("No está disponible el archivo conservado; vuelva a seleccionarlo");
        Document previous = new Document(job);
        previous.remove("attemptHistory");
        List<Document> history = new ArrayList<>(job.getList("attemptHistory", Document.class, List.of()));
        history.add(previous);
        job.put("attemptHistory", history);
        job.put("attempt", job.getInteger("attempt") + 1);
        ImportFileStore.resetCounters(job);
        job.put("status", "QUEUED"); job.put("message", "Reintento en cola");
        files.write(job);
        enqueue(id);
        return ImportResult.from(job);
    }

    private void enqueue(String id) {
        if (!active.add(id)) return;
        worker.submit(() -> {
            try { process(files.read(id)); }
            catch (IOException exception) { /* El último checkpoint permanece recuperable al reiniciar */ }
            finally { active.remove(id); }
        });
    }

    private static void increment(Document job, String field, long value) { job.put(field, number(job, field) + value); }

    private void checkpoint(Document job) throws IOException {
        job.put("elapsedMs", System.currentTimeMillis() - number(job, "startedAt"));
        files.write(job);
    }

    private void flush(Document job, List<Document> batch, Set<String> seen) throws IOException {
        if (batch.isEmpty()) return;
        checkpoint(job);
        Set<String> inserted;
        try {
            if (number(job, "mongoStored") == 0) mongo.initialize();
            inserted = mongo.store(batch);
        } catch (RuntimeException exception) {
            throw new PersistenceFailure("MongoDB no confirmó el lote; reintentar es seguro");
        }
        for (Document row : batch) {
            String id = row.getString("_id");
            if (!seen.add(id)) increment(job, "duplicates", 1);
            else if (inserted.contains(id)) increment(job, "newEvaluations", 1);
            else increment(job, "alreadyExisting", 1);
        }
        increment(job, "mongoStored", batch.size());
        checkpoint(job);
        try {
            if (number(job, "processed") == 0) graph.initialize();
            // Solo se marca SYNCED después de confirmar Neo4j; un commit incierto se recupera con MERGE
            List<Document> stored = mongo.stored(batch);
            if (stored.size() != batch.stream().map(row -> row.getString("_id")).distinct().count()) {
                throw new IllegalStateException("Lote incompleto en MongoDB");
            }
            graph.write(stored);
            mongo.graphState(batch, "SYNCED");
        } catch (RuntimeException exception) {
            try { mongo.graphState(batch, "FAILED"); } catch (RuntimeException ignored) { /* PENDING también indica falta de confirmación */ }
            throw new PersistenceFailure("No se confirmó la sincronización con Neo4j; MongoDB conserva el lote para reintento");
        }
        increment(job, "processed", batch.size());
        batch.clear();
        checkpoint(job);
    }

    private void reject(Document job, String reason, List<String> values) throws IOException {
        files.reject(job, number(job, "totalRead"), reason, values);
        increment(job, "rejected", 1);
    }

    private void process(Document job) throws IOException {
        job.put("status", "RUNNING"); job.put("message", "Procesando registros");
        job.put("startedAt", System.currentTimeMillis()); files.write(job);
        List<Document> batch = new ArrayList<>(BATCH_SIZE);
        Set<String> seen = new HashSet<>();
        boolean headerRead = false;
        try (var input = Files.newInputStream(files.path(job.getString("id"), ".csv"));
             var reader = new PushbackReader(new InputStreamReader(input, StandardCharsets.UTF_8.newDecoder()
                     .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)), 1)) {
            if (!files.intact(job)) throw new IllegalArgumentException("La copia conservada no coincide con su hash; vuelva a seleccionar el archivo original");
            int first = reader.read();
            if (first != -1 && first != '\ufeff') reader.unread(first);
            try (var parser = CSVFormat.RFC4180.builder().setIgnoreEmptyLines(false).get().parse(reader)) {
                Iterator<CSVRecord> records = parser.iterator();
                if (!records.hasNext()) throw new IllegalArgumentException("CSV sin encabezado");
                List<String> header = records.next().toList();
                List<String> names = header.stream().map(name -> EvaluationTransformer.ALIASES.getOrDefault(name, name)).toList();
                if (names.size() != 12 || !new HashSet<>(names).equals(new HashSet<>(EvaluationTransformer.FIELDS))) {
                    throw new IllegalArgumentException("Encabezados inválidos, faltantes o duplicados; se requieren los doce campos del dataset");
                }
                String schema = header.stream().anyMatch(EvaluationTransformer.ALIASES::containsKey) ? "short-headers" : "full-headers";
                headerRead = true;
                while (records.hasNext()) {
                    if (Thread.currentThread().isInterrupted()) throw new PersistenceFailure("Importación interrumpida; vuelva a intentarlo");
                    CSVRecord record = records.next();
                    increment(job, "totalRead", 1);
                    if (record.size() != 12) {
                        reject(job, "Se esperaban doce columnas y se recibieron " + record.size(), record.toList());
                        if (number(job, "totalRead") % BATCH_SIZE == 0) checkpoint(job);
                        continue;
                    }
                    Map<String, String> source = new LinkedHashMap<>();
                    for (int index = 0; index < names.size(); index++) source.put(names.get(index), record.get(index));
                    try {
                        batch.add(transformer.transform(source, job.getString("fileHash"), job.getInteger("fileYear"),
                                schema, number(job, "totalRead")));
                        increment(job, "valid", 1);
                    } catch (IllegalArgumentException exception) {
                        reject(job, exception.getMessage(), record.toList());
                    }
                    if (batch.size() == BATCH_SIZE) flush(job, batch, seen);
                    if (number(job, "totalRead") % BATCH_SIZE == 0) checkpoint(job);
                }
                flush(job, batch, seen);
                job.put("status", number(job, "rejected") > 0 ? "COMPLETED_WITH_REJECTIONS" : "COMPLETED");
                job.put("message", "Lectura completa y registros válidos confirmados en ambos motores");
            }
        } catch (PersistenceFailure exception) {
            job.put("status", number(job, "mongoStored") > 0 ? "PARTIAL" : "FAILED");
            job.put("message", exception.getMessage());
        } catch (IOException | UncheckedIOException exception) {
            if (headerRead) {
                increment(job, "totalRead", 1);
                reject(job, "CSV ilegible o UTF-8 inválido; no se puede continuar después de este registro", List.of());
                try { flush(job, batch, seen); }
                catch (PersistenceFailure failure) { job.put("message", failure.getMessage()); }
            }
            job.put("status", "FAILED");
            job.putIfAbsent("readError", true);
            job.put("message", "Lectura incompleta por CSV ilegible o codificación inválida; revise y vuelva a cargar el archivo");
        } catch (IllegalArgumentException exception) {
            job.put("status", "FAILED"); job.put("message", exception.getMessage());
        } catch (RuntimeException exception) {
            job.put("status", "FAILED"); job.put("message", "No se pudo completar la importación; el archivo se conserva para reintento");
        } finally {
            checkpoint(job);
        }
    }

    @PreDestroy
    public void close() {
        worker.shutdownNow();
        // Esperar el checkpoint antes de liberar el almacén; una caída forzada se recupera como INTERRUPTED
        try { worker.awaitTermination(10, TimeUnit.SECONDS); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
    }

    private static class PersistenceFailure extends RuntimeException {
        PersistenceFailure(String message) { super(message); }
    }
}
