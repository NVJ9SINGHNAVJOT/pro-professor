package com.proprofessor.server.websocket.events;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.proprofessor.server.model.dto.ModelProvider;

/**
 * Events the server receives from the client. Jackson reads the {@code type}
 * discriminator to pick the concrete subtype (polymorphic deserialization), so
 * the handler can {@code switch} over a sealed type exhaustively.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = IncomingEvent.ChatSendEvent.class, name = ChatEvents.CHAT_SEND)
})
public sealed interface IncomingEvent permits IncomingEvent.ChatSendEvent {

    /**
     * {@code chat.send} — the user sends a message.
     *
     * @param conversationId existing conversation, or {@code null} to start a new one
     * @param provider       required when starting a new conversation
     * @param model          required when starting a new conversation
     * @param content        the user's message text
     */
    record ChatSendEvent(
            Long conversationId,
            ModelProvider provider,
            String model,
            String content
    ) implements IncomingEvent {
    }
}
