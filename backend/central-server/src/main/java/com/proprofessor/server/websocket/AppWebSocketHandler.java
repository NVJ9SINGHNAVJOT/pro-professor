package com.proprofessor.server.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.common.web.RequestIdFilter;
import com.proprofessor.server.websocket.events.IncomingEvent;
import com.proprofessor.server.websocket.events.IncomingEvent.PingEvent;
import com.proprofessor.server.websocket.events.OutgoingEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket endpoint at {@code /ws}.
 *
 * <p>The client connects on app load and keeps the socket alive with {@code ping}
 * heartbeats. Any backend service can push {@code notification.info} events to
 * all connected clients via {@link #broadcast(OutgoingEvent)}.
 *
 * <p>Chat streaming uses a separate SSE channel ({@code POST /api/v1/chats/send}).
 */
@Component
public class AppWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(AppWebSocketHandler.class);
    private static final int SEND_TIME_LIMIT_MS = 10_000;
    private static final int SEND_BUFFER_LIMIT_BYTES = 512 * 1024;

    private final ObjectMapper objectMapper;
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public AppWebSocketHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        MDC.put(RequestIdFilter.MDC_KEY, session.getId());
        try {
            sessions.put(session.getId(),
                    new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT_BYTES));
            log.info("WebSocket connected: {}", session.getId());
        } finally {
            MDC.remove(RequestIdFilter.MDC_KEY);
        }
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
        MDC.put(RequestIdFilter.MDC_KEY, session.getId());
        try {
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
        } finally {
            MDC.remove(RequestIdFilter.MDC_KEY);
        }
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        MDC.put(RequestIdFilter.MDC_KEY, session.getId());
        try {
            sessions.remove(session.getId());
            log.info("WebSocket closed: {} ({})", session.getId(), status);
        } finally {
            MDC.remove(RequestIdFilter.MDC_KEY);
        }
    }

    /**
     * Sends a notification to all connected WebSocket clients.
     *
     * @param name        short notification title
     * @param description longer descriptive text
     */
    public void sendNotification(String name, String description) {
        broadcast(OutgoingEvent.NotificationInfo.of(name, description));
    }

    /**
     * Broadcasts an event to every connected WebSocket session. Dead sessions
     * are silently removed on send failure.
     */
    public void broadcast(OutgoingEvent event) {
        String json;
        try {
            json = objectMapper.writeValueAsString(event);
        } catch (IOException ex) {
            log.error("Failed to serialize outgoing event: {}", ex.getMessage());
            return;
        }

        TextMessage textMessage = new TextMessage(json);
        for (var entry : sessions.entrySet()) {
            try {
                entry.getValue().sendMessage(textMessage);
            } catch (IOException ex) {
                log.debug("Failed to send to session {}, removing: {}", entry.getKey(), ex.getMessage());
                sessions.remove(entry.getKey());
            }
        }
    }
}
