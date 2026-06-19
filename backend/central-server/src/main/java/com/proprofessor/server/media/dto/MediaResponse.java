package com.proprofessor.server.media.dto;

/**
 * A stored file as exposed to the frontend. {@code url} is the central-server
 * proxy path that streams the bytes ({@code GET /api/v1/media/{id}/file}), so
 * the browser never talks to the storage-service directly.
 *
 * @param id               the media row id
 * @param url              relative download URL served by central-server
 * @param originalFilename original filename from the upload
 * @param mimeType         detected MIME type
 * @param size             file size in bytes
 */
public record MediaResponse(
        Long id,
        String url,
        String originalFilename,
        String mimeType,
        long size
) {
}
