package com.proprofessor.server.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Thread pool for chat streaming work. The WebSocket receive thread must not block
 * on the slow upstream model call, so each {@code chat.send} is processed here.
 */
@Configuration
public class ChatExecutorConfig {

    @Bean
    public ThreadPoolTaskExecutor chatStreamExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("chat-stream-");
        executor.initialize();
        return executor;
    }
}
