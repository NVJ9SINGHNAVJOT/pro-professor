package com.proprofessor.server.notes.ai.dto;

/**
 * Response payload for {@code GET /api/v1/notes/ai/status} — lets the frontend
 * label the Claude provider option before a request is attempted.
 *
 * @param claudeConfigured whether an Anthropic API key is configured
 * @param claudeModel      the Claude model AI actions would use
 */
public record NoteAiStatus(
        boolean claudeConfigured,
        String claudeModel
) {
}
