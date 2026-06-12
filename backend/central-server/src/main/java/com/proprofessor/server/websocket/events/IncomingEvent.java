package com.proprofessor.server.websocket.events;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * Events the server receives from the client. Jackson reads the {@code type}
 * discriminator to pick the concrete subtype (polymorphic deserialization), so
 * the handler can {@code switch} over a sealed type exhaustively.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = IncomingEvent.PingEvent.class, name = ChatEvents.PING)
})
public sealed interface IncomingEvent permits IncomingEvent.PingEvent {

    /** {@code ping} — client heartbeat to keep the connection alive; no payload, no reply. */
    record PingEvent() implements IncomingEvent {
    }
}
