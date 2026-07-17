package com.proprofessor.server.notes.ai.dto;

/**
 * Request body for the notes AI actions ({@code /ai-update}, {@code /summarize}, {@code /continue}).
 *
 * @param instruction what to do to the note (required for {@code /ai-update}; ignored otherwise)
 * @param provider    {@code claude} (Anthropic API), {@code ollama}, or {@code ai-service}
 * @param model       provider model id — required for the local providers, ignored for {@code claude}
 */
public record NoteAiRequest(
        String instruction,
        String provider,
        String model
) {
}
