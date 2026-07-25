package com.proprofessor.server.media;

import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.media.dto.MediaResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Stores uploads in the storage-server and keeps only the reference (the
 * storage UUID + metadata) in Postgres. Downloads are not proxied: the browser
 * gets a direct storage-server URL ({@link #toResponse}) and streams the bytes
 * itself, so file bytes never pass through the JVM heap.
 */
@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private final StorageClient storageClient;
    private final MediaRepository mediaRepository;

    public MediaService(StorageClient storageClient, MediaRepository mediaRepository) {
        this.storageClient = storageClient;
        this.mediaRepository = mediaRepository;
    }

    /** Uploads bytes to the storage-server and persists a reference row. */
    public MediaResponse upload(byte[] bytes, String filename) {
        // The request log only shows a multipart summary (the bytes are never logged), so these lines are
        // the only record of what was actually uploaded and where it landed.
        log.info("Uploading file '{}' ({} bytes) to storage-server...", filename, bytes.length);
        long start = System.currentTimeMillis();

        StorageClient.StorageMedia stored;
        try {
            stored = storageClient.upload(bytes, filename);
        } catch (Exception ex) {
            log.warn("Failed to upload file '{}' after {}ms: {}",
                    filename, System.currentTimeMillis() - start, ex.getMessage());
            throw ex;
        }
        if (stored == null || stored.id() == null) {
            log.warn("Failed to upload file '{}': storage-server returned no media id", filename);
            throw new AppException(HttpStatus.BAD_GATEWAY, "Storage service did not return a media id.");
        }

        MediaRow row = mediaRepository.insert(
                stored.id(),
                stored.originalFilename(),
                stored.mimeType(),
                stored.size(),
                stored.category());
        log.info("Uploaded file '{}' ({}ms): mediaId={} storageId={} mimeType={} size={}",
                filename, System.currentTimeMillis() - start,
                row.id(), row.storageId(), row.mimeType(), row.size());
        return toResponse(row);
    }

    /**
     * The direct storage-server URL for the newest upload with this original filename, or empty
     * when nothing matches. Resolves note {@code ![[image.png]]} embeds — the note payload carries
     * these URLs so the browser loads embedded images straight from storage.
     */
    public Optional<String> urlByFilename(String filename) {
        return mediaRepository.findLatestByFilename(filename)
                .map(row -> storageClient.fileUrl(row.storageId()));
    }

    /** Raw stored bytes for a known media row — used to forward audio clips to the model. */
    public byte[] bytes(MediaRow row) {
        return storageClient.download(row.storageId()).getBody();
    }

    /** Maps a stored row to the wire shape, deriving the direct storage-server download URL. */
    public MediaResponse toResponse(MediaRow row) {
        return new MediaResponse(
                row.id(),
                storageClient.fileUrl(row.storageId()),
                row.originalFilename(),
                row.mimeType(),
                row.size());
    }
}
