package com.proprofessor.server.config;

import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.Map;

/**
 * Thread pool for chat streaming work. The HTTP request thread must not block on
 * the slow upstream model call, so each SSE chat send is processed here.
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
        // Carry the SLF4J MDC (e.g. requestId) from the request thread onto the worker thread
        // so streaming logs stay correlated with the originating request.
        executor.setTaskDecorator(ChatExecutorConfig::withMdc);
        executor.initialize();
        return executor;
    }

    private static Runnable withMdc(Runnable task) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        return () -> {
            if (context != null) {
                MDC.setContextMap(context);
            }
            try {
                task.run();
            } finally {
                MDC.clear();
            }
        };
    }
}
