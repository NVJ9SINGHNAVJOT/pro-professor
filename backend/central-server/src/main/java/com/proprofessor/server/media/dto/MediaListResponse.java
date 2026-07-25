package com.proprofessor.server.media.dto;

import java.util.List;

/**
 * Response payload for {@code GET /api/v1/media} — wraps the list under a {@code media} key
 * (same convention as the chats and models endpoints) alongside the storage-server's page counters.
 */
public record MediaListResponse(
        List<MediaItem> media,
        PaginationDto pagination
) {

    /**
     * Page counters passed straight through from the storage-server.
     *
     * @param total   total files matching the filter
     * @param limit   page size actually applied (the storage-server clamps it to 1..100)
     * @param offset  offset actually applied
     * @param hasMore whether another page follows
     */
    public record PaginationDto(int total, int limit, int offset, boolean hasMore) {
    }
}
