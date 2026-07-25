package com.proprofessor.server.media.dto;

/**
 * A stored file as exposed to the frontend. {@code url} is the <em>direct</em>
 * storage-server URL ({@code GET {storage}/api/media/{uuid}/file}) the browser
 * downloads from itself — central-server does not proxy the bytes.
 *
 * @param id               the media row id
 * @param url              absolute storage-server URL the browser streams the file from
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
