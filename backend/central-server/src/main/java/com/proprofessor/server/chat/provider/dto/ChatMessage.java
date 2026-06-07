package com.proprofessor.server.chat.provider.dto;

/**
 * A single chat message in the OpenAI shape, used to carry conversation history
 * (oldest first) from the chat service to the provider client.
 *
 * @param role    one of {@code system}, {@code user}, {@code assistant}
 * @param content the message text
 */
public record ChatMessage(
        String role,
        String content
) {
}
