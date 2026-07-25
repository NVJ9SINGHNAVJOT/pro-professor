package com.proprofessor.server.media.dto;

import java.time.Instant;

/**
 * A stored file as listed in the Settings → Storage browser. Keyed by the storage-server UUID
 * rather than the {@code media} row id: the listing comes from the storage-server's filesystem,
 * which is the source of truth, so a file uploaded outside central-server (or one whose reference
 * row never landed) still appears here with no row id to name it by.
 *
 * @param storageId        the storage-server UUID — also the key for deletes
 * @param url              absolute storage-server URL the browser streams the file from
 * @param originalFilename original filename from the upload
 * @param mimeType         detected MIME type
 * @param size             file size in bytes
 * @param category         storage bucket: images, videos, audio, documents or others
 * @param createdAt        when the file was stored
 * @param usage            where the file is referenced — drives the browser's "in use" badge and
 *                         mirrors what the delete guard checks
 */
public record MediaItem(
        String storageId,
        String url,
        String originalFilename,
        String mimeType,
        long size,
        String category,
        Instant createdAt,
        Usage usage
) {

    /**
     * How many places reference this file. Both counts being zero means it is safe to delete;
     * either being non-zero means a delete is refused with 409.
     *
     * @param chatMessages chat messages carrying it as an attachment
     * @param notes        notes embedding it as {@code ![[file.png]]}
     */
    public record Usage(int chatMessages, int notes) {
    }
}
