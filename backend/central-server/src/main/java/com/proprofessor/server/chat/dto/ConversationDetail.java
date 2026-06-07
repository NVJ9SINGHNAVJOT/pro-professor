package com.proprofessor.server.chat.dto;

import java.time.Instant;
import java.util.List;

/**
 * Full conversation with its messages, for opening a chat thread.
 *
 * @param id        conversation id
 * @param title     conversation title
 * @param model     model name
 * @param provider  model provider
 * @param mode      conversation mode ({@code simple})
 * @param messages  messages oldest-first
 * @param createdAt when the conversation started
 * @param updatedAt last activity
 */
public record ConversationDetail(
        Long id,
        String title,
        String model,
        String provider,
        String mode,
        List<ChatMessageDto> messages,
        Instant createdAt,
        Instant updatedAt
) {
}
