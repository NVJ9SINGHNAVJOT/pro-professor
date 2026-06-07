package com.proprofessor.server.chat.provider.dto;

import java.util.List;

/**
 * OpenAI-compatible chat completion request body sent to Ollama or the AI service.
 * We always stream, so {@code stream} is fixed to {@code true}.
 *
 * @param model    provider model id (e.g. {@code llama3.1:8b})
 * @param messages ordered conversation history, oldest first
 * @param stream   always {@code true} here
 */
public record ChatCompletionRequest(
        String model,
        List<Message> messages,
        boolean stream
) {

    /** A single chat message in the OpenAI request shape. */
    public record Message(
            String role,
            String content
    ) {
    }
}
