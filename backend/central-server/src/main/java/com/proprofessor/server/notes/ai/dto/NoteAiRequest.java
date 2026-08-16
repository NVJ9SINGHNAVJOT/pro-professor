package com.proprofessor.server.notes.ai.dto;

/**
 * Request body for the AI note update ({@code POST /api/v1/notes/{id}/ai-update}).
 *
 * @param instruction what to do to the note — required
 * @param provider    {@code ollama} or {@code ai-core}
 * @param model       provider model id — required
 * @param selection   the exact text to rewrite, when the edit is scoped to an editor selection; the
 *                    model then answers with that span's replacement alone rather than the whole
 *                    note. Null or blank for a whole-note rewrite.
 */
public record NoteAiRequest(
        String instruction,
        String provider,
        String model,
        String selection
) {
}
