package com.proprofessor.server.media;

import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.media.dto.MediaItem;
import com.proprofessor.server.media.dto.MediaListResponse;
import com.proprofessor.server.media.dto.MediaResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
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

    /** Usage for a file with no reference row — nothing in the app can be pointing at it. */
    private static final MediaRepository.Usage NOT_USED = new MediaRepository.Usage(0, 0);

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
     * One page of stored files for the Settings → Storage browser. The listing comes from the
     * storage-server (the filesystem is the source of truth), so files with no Postgres reference
     * row are included too; every argument is optional and forwarded as-is.
     */
    public MediaListResponse list(String category, String sortBy, String order, Integer limit, Integer offset) {
        StorageClient.Paged<StorageClient.StorageMedia> page =
                storageClient.list(category, sortBy, order, limit, offset);

        Map<String, MediaRepository.Usage> usage = mediaRepository.usageByStorageIds(
                page.data().stream().map(StorageClient.StorageMedia::id).toList());

        List<MediaItem> items = page.data().stream()
                .map(m -> {
                    MediaRepository.Usage used = usage.getOrDefault(m.id(), NOT_USED);
                    return new MediaItem(
                            m.id(),
                            storageClient.fileUrl(m.id()),
                            m.originalFilename(),
                            m.mimeType(),
                            m.size(),
                            m.category(),
                            m.createdAt(),
                            new MediaItem.Usage(used.chatMessages(), used.notes()));
                })
                .toList();

        StorageClient.Pagination p = page.pagination();
        return new MediaListResponse(
                items,
                new MediaListResponse.PaginationDto(p.total(), p.limit(), p.offset(), p.hasMore()));
    }

    /**
     * Deletes a stored file and its reference row.
     *
     * <p>Refused with 409 while anything still points at the file — a chat attachment
     * ({@code message_attachments} has no cascade, so the message would render a dead link) or a
     * note {@code ![[image.png]]} embed (read from {@code note_links}, which every note save
     * rebuilds). Only the upload an embed actually resolves to is protected: re-uploading a
     * filename leaves the superseded copy free to delete.
     *
     * <p>Not covered: images embedded by URL ({@code ![alt](http://…/api/media/{uuid}/file)}),
     * which are plain Markdown and leave no link row.
     */
    public void delete(String storageId) {
        Optional<MediaRow> row = mediaRepository.findByStorageId(storageId);

        row.ifPresent(r -> {
            int attachments = mediaRepository.countAttachments(r.id());
            if (attachments > 0) {
                throw new AppException(HttpStatus.CONFLICT, "This file is attached to "
                        + attachments + (attachments == 1 ? " chat message" : " chat messages")
                        + " and can't be deleted.");
            }
            if (backsAnEmbed(r)) {
                List<String> notes = mediaRepository.noteTitlesEmbedding(r.originalFilename());
                if (!notes.isEmpty()) {
                    throw new AppException(HttpStatus.CONFLICT, "This file is embedded in "
                            + notes.size() + (notes.size() == 1 ? " note (" : " notes (")
                            + String.join(", ", notes) + ") and can't be deleted.");
                }
            }
        });

        storageClient.delete(storageId);
        row.ifPresent(r -> mediaRepository.deleteById(r.id()));
        log.info("Deleted file: storageId={} mediaId={}", storageId, row.map(MediaRow::id).orElse(null));
    }

    /**
     * Whether this row is the one a {@code ![[filename]]} embed resolves to — the newest upload
     * with that filename, matching {@link #urlByFilename}. An older duplicate backs nothing.
     */
    private boolean backsAnEmbed(MediaRow row) {
        return mediaRepository.findLatestByFilename(row.originalFilename())
                .map(latest -> latest.id() == row.id())
                .orElse(false);
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
