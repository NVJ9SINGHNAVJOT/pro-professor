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

/**
 * Talks to the Go storage-server. Uploads still flow through central-server (so we can
 * record a reference row), but downloads no longer proxy bytes: {@link #fileUrl(String)}
 * builds the storage-server URL the browser fetches directly.
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

    /** Streams the original bytes back, preserving the upstream {@code Content-Type}. */
    public ResponseEntity<byte[]> download(String storageId) {
        return restClient.get()
                .uri("/api/media/{id}/file", storageId)
                .retrieve()
                .toEntity(byte[].class);
    }

    /** Permanently deletes the file from the storage-server. */
    public void delete(String storageId) {
        restClient.delete()
                .uri("/api/media/{id}", storageId)
                .retrieve()
                .toBodilessEntity();
    }

    /** Storage-server media object (subset of fields we use). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record StorageMedia(
            String id,
            String originalFilename,
            String mimeType,
            long size,
            String category
    ) {
    }

    /** The {@code { "data": ... }} envelope every storage-server response uses. */
    private record Envelope<T>(T data) {
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
