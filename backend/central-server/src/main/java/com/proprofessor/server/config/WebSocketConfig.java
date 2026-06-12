package com.proprofessor.server.config;

import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.websocket.ChatWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Registers raw WebSocket handlers.
 *
 * <p>The chat handler is exposed at {@code /ws}. Allowed origins are reused from
 * {@link AppProperties} so REST and WebSocket share the same CORS-origin policy.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatWebSocketHandler;
    private final AppProperties appProperties;

    public WebSocketConfig(ChatWebSocketHandler chatWebSocketHandler, AppProperties appProperties) {
        this.chatWebSocketHandler = chatWebSocketHandler;
        this.appProperties = appProperties;
    }

    @Override
    public void registerWebSocketHandlers(@NonNull WebSocketHandlerRegistry registry) {
        registry.addHandler(chatWebSocketHandler, "/ws")
                .setAllowedOrigins(appProperties.cors().allowedOrigins().toArray(String[]::new));
    }
}
