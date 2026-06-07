package com.proprofessor.server.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Type-safe application configuration bound from the {@code app.*} keys in
 * {@code application.yml}.
 *
 * <p>This is the Spring equivalent of reading {@code process.env} in Node, but
 * validated and strongly typed. Inject this record wherever config is needed
 * instead of reading environment variables directly.
 *
 * @param cors      CORS-related settings (allowed frontend origins)
 * @param aiService connection details for the Python AI service
 * @param ollama    connection details for the local Ollama service
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Cors cors,
        AiService aiService,
        Ollama ollama
) {

    /**
     * @param allowedOrigins origins permitted to call this server (the React frontend)
     */
    public record Cors(
            List<String> allowedOrigins
    ) {
    }

    /**
     * @param baseUrl base URL of the OpenAI-compatible AI service
     * @param apiKey  API key sent to the AI service (placeholder for local use)
     */
    public record AiService(
            String baseUrl,
            String apiKey
    ) {
    }

    /**
     * @param baseUrl base URL of the local Ollama service
     * @param apiKey  API key for Ollama (placeholder for local use)
     */
    public record Ollama(
            String baseUrl,
            String apiKey
    ) {
    }
}
