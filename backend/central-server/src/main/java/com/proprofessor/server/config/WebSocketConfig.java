package com.proprofessor.server.config;

import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.websocket.AppWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Registers raw WebSocket handlers.
 *
 * <p>The app-wide handler is exposed at {@code /ws}. Allowed origins are reused from
 * {@link AppProperties} so REST and WebSocket share the same CORS-origin policy.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final AppWebSocketHandler appWebSocketHandler;
    private final AppProperties appProperties;

    public WebSocketConfig(AppWebSocketHandler appWebSocketHandler, AppProperties appProperties) {
        this.appWebSocketHandler = appWebSocketHandler;
        this.appProperties = appProperties;
    }

    @Override
    public void registerWebSocketHandlers(@NonNull WebSocketHandlerRegistry registry) {
        registry.addHandler(appWebSocketHandler, "/ws")
                .setAllowedOrigins(appProperties.cors().allowedOrigins().toArray(String[]::new));
    }
}
