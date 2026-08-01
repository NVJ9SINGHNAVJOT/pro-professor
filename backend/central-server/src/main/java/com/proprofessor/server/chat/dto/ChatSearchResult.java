package com.proprofessor.server.chat.dto;

import java.time.Instant;

/**
 * One hit from the ⌘K palette's chat search.
 *
 * @param id        the conversation to open
 * @param title     conversation title (may be null before the first turn names it)
 * @param snippet   an excerpt of the best-matching message, for context in the result row
 * @param updatedAt last activity, the tiebreak when ranks are equal
 */
public record ChatSearchResult(
        Long id,
        String title,
        String snippet,
        Instant updatedAt
) {
}
