package com.proprofessor.server.notes.ai.dto;

/**
 * Request body for the notes AI actions ({@code /ai-update}, {@code /summarize}, {@code /continue}).
 *
 * @param instruction what to do to the note (required for {@code /ai-update}; ignored otherwise)
 * @param provider    {@code ollama} or {@code ai-service}
 * @param model       provider model id — required
 */
public record NoteAiRequest(
        String instruction,
        String provider,
        String model
) {
}
