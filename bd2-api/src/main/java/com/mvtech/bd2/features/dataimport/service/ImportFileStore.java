package com.mvtech.bd2.features.dataimport.service;

import com.mvtech.bd2.features.dataimport.dto.RejectionPage;
import jakarta.annotation.PreDestroy;
import org.bson.Document;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;

import static java.nio.file.StandardOpenOption.*;

@Component
public class ImportFileStore {
    private final Path directory;
    private final FileChannel lockChannel;
    private final FileLock workerLock;

    public ImportFileStore(@Value("${bd2.import-directory}") String directory) throws IOException {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(this.directory);
        lockChannel = FileChannel.open(this.directory.resolve("worker.lock"), CREATE, WRITE);
        workerLock = lockChannel.tryLock();
        if (workerLock == null) throw new IOException("Otra instancia utiliza el directorio de importaciones");
    }

    public Path path(String id, String suffix) {
        if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("Identificador de importación inválido");
        return directory.resolve(id + suffix);
    }

    public Document create(MultipartFile file) throws IOException {
        String name = Objects.requireNonNullElse(file.getOriginalFilename(), "archivo.csv")
                .replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
        if (name.length() > 200) name = name.substring(name.length() - 200);
        String id = UUID.randomUUID().toString();
        String digest;
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            try (var stream = new DigestInputStream(file.getInputStream(), sha)) {
                Files.copy(stream, path(id, ".csv"));
            }
            digest = HexFormat.of().formatHex(sha.digest());
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
        var match = Pattern.compile("([0-9]{4})\\.csv$", Pattern.CASE_INSENSITIVE).matcher(name);
        Integer year = match.find() ? Integer.valueOf(match.group(1)) : null;
        Document job = new Document("id", id).append("fileName", name).append("fileHash", digest)
                .append("fileYear", year).append("attempt", 1).append("status", "QUEUED")
                .append("message", "Archivo en cola").append("createdAt", System.currentTimeMillis());
        resetCounters(job);
        write(job);
        return job;
    }

    public boolean intact(Document job) throws IOException {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            try (var stream = new DigestInputStream(Files.newInputStream(path(job.getString("id"), ".csv")), sha)) {
                stream.transferTo(OutputStream.nullOutputStream());
            }
            return HexFormat.of().formatHex(sha.digest()).equals(job.getString("fileHash"));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    public static void resetCounters(Document job) {
        for (String field : List.of("totalRead", "valid", "processed", "rejected", "mongoStored",
                "newEvaluations", "alreadyExisting", "duplicates", "elapsedMs")) job.put(field, 0L);
    }

    public void write(Document job) throws IOException {
        String id = job.getString("id");
        Path temporary = Files.createTempFile(directory, id, ".tmp");
        try {
            Files.writeString(temporary, job.toJson(), StandardCharsets.UTF_8, TRUNCATE_EXISTING);
            try (FileChannel channel = FileChannel.open(temporary, WRITE)) { channel.force(true); }
            Files.move(temporary, path(id, ".json"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    public Document read(String id) throws IOException {
        return Document.parse(Files.readString(path(id, ".json"), StandardCharsets.UTF_8));
    }

    public List<Document> list(int offset, int limit) throws IOException {
        List<Path> files;
        try (var paths = Files.list(directory)) {
            files = paths.filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparingLong((Path p) -> p.toFile().lastModified()).reversed())
                    .skip(offset).limit(limit).toList();
        }
        List<Document> jobs = new ArrayList<>();
        for (Path path : files) jobs.add(Document.parse(Files.readString(path, StandardCharsets.UTF_8)));
        return jobs;
    }

    public void reject(Document job, long record, String reason, List<String> values) throws IOException {
        List<String> preview = values.stream().limit(20).map(v -> v.substring(0, Math.min(v.length(), 512))).toList();
        Document rejected = new Document("recordNumber", record).append("reason", reason).append("values", preview);
        Files.writeString(path(job.getString("id"), ".attempt-" + job.getInteger("attempt") + ".rejections.jsonl"),
                rejected.toJson() + "\n", StandardCharsets.UTF_8, CREATE, APPEND);
    }

    public RejectionPage rejections(String id, int offset, int limit) throws IOException {
        Document job = read(id);
        Path path = path(id, ".attempt-" + job.getInteger("attempt") + ".rejections.jsonl");
        long total = com.mvtech.bd2.features.dataimport.dto.ImportResult.number(job, "rejected");
        List<RejectionPage.Rejection> items = new ArrayList<>();
        if (Files.exists(path)) {
            try (var lines = Files.lines(path, StandardCharsets.UTF_8)) {
                // Publicar solo rechazos del checkpoint evita mezclar contadores antiguos con filas aún no confirmadas
                lines.limit(total).skip(offset).limit(limit).map(Document::parse).forEach(d -> items.add(new RejectionPage.Rejection(
                        ((Number) d.get("recordNumber")).longValue(), d.getString("reason"), d.getList("values", String.class))));
            }
        }
        return new RejectionPage(items, offset, limit, total);
    }

    @PreDestroy
    public void close() throws IOException {
        workerLock.release();
        lockChannel.close();
    }
}
