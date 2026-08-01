package com.proprofessor.server.chat.dto;

import java.util.List;

/**
 * Chat hits for the ⌘K palette, ranked best-first.
 *
 * @param results matching conversations, each with an excerpt of its best-matching message
 */
public record ChatSearchResponse(List<ChatSearchResult> results) {
}
