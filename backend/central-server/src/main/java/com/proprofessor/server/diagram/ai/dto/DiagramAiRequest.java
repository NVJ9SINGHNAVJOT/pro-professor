package com.proprofessor.server.diagram.ai.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Request body for {@code /diagrams/{id}/ai-edit}.
 *
 * @param instruction      what to change in the diagram — required
 * @param provider         {@code ollama} or {@code ai-service}
 * @param model            provider model id — required
 * @param semantic         the CURRENT semantic JSON from the client's store (which may
 *                         be ahead of the saved row — the edit targets what the user sees)
 * @param priorReply       repair retry only: the model's previous (invalid) reply
 * @param validationErrors repair retry only: why that reply was rejected
 */
public record DiagramAiRequest(
        String instruction,
        String provider,
        String model,
        JsonNode semantic,
        String priorReply,
        String validationErrors
) {
}
