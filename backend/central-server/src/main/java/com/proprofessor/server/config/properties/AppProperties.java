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
 * @param cors          CORS-related settings (allowed frontend origins)
 * @param aiCore        connection details for the Python AI core
 * @param ollama        connection details for the local Ollama service
 * @param storageServer connection details for the Go storage-server
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Cors cors,
        AiCore aiCore,
        Ollama ollama,
        StorageServer storageServer
) {

    /**
     * @param allowedOrigins origins permitted to call this server (the React frontend)
     */
    public record Cors(
            List<String> allowedOrigins
    ) {
    }

    /**
     * @param baseUrl base URL of the OpenAI-compatible AI core
     * @param apiKey  API key sent to the AI core (placeholder for local use)
     */
    public record AiCore(
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

    /**
     * @param baseUrl base URL of the Go storage-server (uploads + media downloads)
     */
    public record StorageServer(
            String baseUrl
    ) {
    }
}
