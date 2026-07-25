package com.proprofessor.server.media;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;

/**
 * Talks to the Go storage-server. Uploads, listings and deletes flow through central-server
 * (so we can record a reference row, and because the storage-server sends no CORS headers),
 * but downloads no longer proxy bytes: {@link #fileUrl(String)} builds the storage-server URL
 * the browser fetches directly.
 *
 * <p>The storage-server behaves like an object store: upload bytes and get back
 * a UUID, fetch them by that UUID, delete by UUID. Every storage-server
 * response is wrapped in a {@code { "data": ... }} envelope.
 */
@Component
public class StorageClient {

    private static final String DEFAULT_FILENAME = "upload.bin";

    private final RestClient restClient;
    private final String baseUrl;

    public StorageClient(AppProperties appProperties) {
        String configured = appProperties.storageServer().baseUrl();
        this.baseUrl = configured.endsWith("/") ? configured.substring(0, configured.length() - 1) : configured;
        this.restClient = HttpClientFactory.forBaseUrl(configured);
    }

    /**
     * The storage-server URL that streams this file's bytes. Handed to the browser (via
     * {@code MediaResponse.url}) so downloads go straight to storage — never through the JVM.
     * This base URL must therefore be reachable from the browser, not just from central-server.
     */
    public String fileUrl(String storageId) {
        return baseUrl + "/api/media/" + storageId + "/file";
    }

    /** Uploads bytes and returns the stored file's metadata. */
    public StorageMedia upload(byte[] bytes, String filename) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new NamedByteArrayResource(bytes, filename));

        Envelope<StorageMedia> result = restClient.post()
                .uri("/api/media/upload")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
                .retrieve()
                .body(new org.springframework.core.ParameterizedTypeReference<>() {
                });

        return result == null ? null : result.data();
    }

    /**
     * One page of stored files, straight from the storage-server's own listing (the filesystem is
     * the source of truth, so files with no Postgres row still show up). Every parameter is
     * optional — {@code null} ones are left off so the storage-server applies its own defaults and
     * clamping (sort by {@code created_at} desc, limit 50 capped at 100).
     */
    public Paged<StorageMedia> list(String category, String sortBy, String order, Integer limit, Integer offset) {
        Paged<StorageMedia> result = restClient.get()
                .uri(builder -> {
                    builder.path("/api/media");
                    if (category != null && !category.isBlank()) {
                        builder.queryParam("category", category);
                    }
                    if (sortBy != null && !sortBy.isBlank()) {
                        builder.queryParam("sort_by", sortBy);
                    }
                    if (order != null && !order.isBlank()) {
                        builder.queryParam("order", order);
                    }
                    if (limit != null) {
                        builder.queryParam("limit", limit);
                    }
                    if (offset != null) {
                        builder.queryParam("offset", offset);
                    }
                    return builder.build();
                })
                .retrieve()
                .body(new org.springframework.core.ParameterizedTypeReference<>() {
                });

        return result == null ? new Paged<>(List.of(), new Pagination(0, 0, 0, false)) : result;
    }

    /** Streams the original bytes back, preserving the upstream {@code Content-Type}. */
    public ResponseEntity<byte[]> download(String storageId) {
        return restClient.get()
                .uri("/api/media/{id}/file", storageId)
                .retrieve()
                .toEntity(byte[].class);
    }

    /**
     * Permanently deletes the file from the storage-server. A 404 is treated as success — the
     * file is gone either way, and the caller still needs to clear the Postgres reference row.
     */
    public void delete(String storageId) {
        restClient.delete()
                .uri("/api/media/{id}", storageId)
                .retrieve()
                .onStatus(status -> status.value() == 404, (request, response) -> {
                })
                .toBodilessEntity();
    }

    /** Storage-server media object (subset of fields we use). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record StorageMedia(
            String id,
            String originalFilename,
            String mimeType,
            long size,
            String category,
            Instant createdAt
    ) {
    }

    /** The {@code { "data": ... }} envelope every storage-server response uses. */
    private record Envelope<T>(T data) {
    }

    /** The {@code { "data": [...], "pagination": {...} }} envelope list responses use. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Paged<T>(List<T> data, Pagination pagination) {
    }

    /** Page counters the storage-server reports alongside a listing. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Pagination(int total, int limit, int offset, boolean hasMore) {
    }

    /** A {@link ByteArrayResource} that carries a filename so the multipart part is named. */
    private static final class NamedByteArrayResource extends ByteArrayResource {
        private final String filename;

        private NamedByteArrayResource(byte[] bytes, String filename) {
            super(bytes);
            this.filename = (filename == null || filename.isBlank()) ? DEFAULT_FILENAME : filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }
}
