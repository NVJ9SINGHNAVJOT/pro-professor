package com.proprofessor.server.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.websocket.events.IncomingEvent;
import com.proprofessor.server.websocket.events.IncomingEvent.PingEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket endpoint at {@code /ws}.
 *
 * <p>The client connects on app load and keeps the socket alive with {@code ping}
 * heartbeats. Chat replies stream over SSE ({@code POST /api/v1/chats/send}).
 */
@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);
    private static final int SEND_TIME_LIMIT_MS = 10_000;
    private static final int SEND_BUFFER_LIMIT_BYTES = 512 * 1024;

    private final ObjectMapper objectMapper;
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public ChatWebSocketHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        sessions.put(session.getId(),
                new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT_BYTES));
        log.info("WebSocket connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
        IncomingEvent event;
        try {
            event = objectMapper.readValue(message.getPayload(), IncomingEvent.class);
        } catch (Exception ex) {
            // unknown event types are ignored gracefully — no error reply
            log.debug("Unhandled WS message from {}: {}", session.getId(), ex.getMessage());
            return;
        }

        switch (event) {
            case PingEvent ignored -> log.trace("Heartbeat from {}", session.getId());
        }
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        sessions.remove(session.getId());
        log.info("WebSocket closed: {} ({})", session.getId(), status);
    }
}
