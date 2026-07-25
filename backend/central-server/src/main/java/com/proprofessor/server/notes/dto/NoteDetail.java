package com.proprofessor.server.notes.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Full note payload for the editor.
 *
 * @param id          note id
 * @param title       note title
 * @param content     full Markdown source (including any frontmatter block)
 * @param frontmatter the parsed YAML frontmatter ({@code {}} when the note has none)
 * @param tags        the note's tags (frontmatter + inline), sorted
 * @param embedUrls   image {@code ![[file.png]]} embeds → their direct storage-server URL, so the
 *                    browser loads embedded images straight from storage (empty when the note has none)
 * @param createdAt   creation time
 * @param updatedAt   last edit
 */
public record NoteDetail(
        Long id,
        String title,
        String content,
        Map<String, Object> frontmatter,
        List<String> tags,
        Map<String, String> embedUrls,
        Instant createdAt,
        Instant updatedAt
) {
}
