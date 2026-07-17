package com.proprofessor.server.media;

import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.media.dto.MediaResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

/**
 * Stores uploads in the storage-service and keeps only the reference (the
 * storage UUID + metadata) in Postgres, then proxies downloads back so the
 * browser only ever talks to central-server.
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

    /** Uploads bytes to the storage-service and persists a reference row. */
    public MediaResponse upload(byte[] bytes, String filename) {
        // The request log only shows a multipart summary (the bytes are never logged), so these lines are
        // the only record of what was actually uploaded and where it landed.
        log.info("Uploading file '{}' ({} bytes) to storage-service...", filename, bytes.length);
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
            log.warn("Failed to upload file '{}': storage-service returned no media id", filename);
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

    /** Streams a stored file back through central-server, preserving its MIME type. */
    public ResponseEntity<byte[]> download(long id) {
        MediaRow row = mediaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Media not found: " + id));
        log.info("Downloading media {} from storage-service: storageId={} filename='{}'",
                id, row.storageId(), row.originalFilename());
        return storageClient.download(row.storageId());
    }

    /** Streams the newest stored file with this original filename — resolves note {@code ![[image.png]]} embeds. */
    public ResponseEntity<byte[]> downloadByFilename(String filename) {
        MediaRow row = mediaRepository.findLatestByFilename(filename)
                .orElseThrow(() -> new ResourceNotFoundException("Media not found: " + filename));
        log.info("Downloading media by filename '{}' from storage-service: mediaId={} storageId={}",
                filename, row.id(), row.storageId());
        return storageClient.download(row.storageId());
    }

    /** Raw stored bytes for a known media row — used to forward audio clips to the model. */
    public byte[] bytes(MediaRow row) {
        return storageClient.download(row.storageId()).getBody();
    }

    /** Maps a stored row to the wire shape, deriving the central-server download URL. */
    public MediaResponse toResponse(MediaRow row) {
        return new MediaResponse(
                row.id(),
                "/api/v1/media/" + row.id() + "/file",
                row.originalFilename(),
                row.mimeType(),
                row.size());
    }
}
