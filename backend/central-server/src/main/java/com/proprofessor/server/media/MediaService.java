package com.proprofessor.server.media;

import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.media.dto.MediaResponse;
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

    private final StorageClient storageClient;
    private final MediaRepository mediaRepository;

    public MediaService(StorageClient storageClient, MediaRepository mediaRepository) {
        this.storageClient = storageClient;
        this.mediaRepository = mediaRepository;
    }

    /** Uploads bytes to the storage-service and persists a reference row. */
    public MediaResponse upload(byte[] bytes, String filename) {
        StorageClient.StorageMedia stored = storageClient.upload(bytes, filename);
        if (stored == null || stored.id() == null) {
            throw new AppException(HttpStatus.BAD_GATEWAY, "Storage service did not return a media id.");
        }
        MediaRow row = mediaRepository.insert(
                stored.id(),
                stored.originalFilename(),
                stored.mimeType(),
                stored.size(),
                stored.category());
        return toResponse(row);
    }

    /** Streams a stored file back through central-server, preserving its MIME type. */
    public ResponseEntity<byte[]> download(long id) {
        MediaRow row = mediaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Media not found: " + id));
        return storageClient.download(row.storageId());
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
