package com.proprofessor.server.model.provider;

import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.dto.OllamaTagsResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Talks to the local Ollama service and maps its models into {@link ProviderModel}.
 * Owns the external call and the mapping; does not persist or know about the web layer.
 */
@Component
public class OllamaClient {

    private final RestClient restClient;

    public OllamaClient(AppProperties appProperties) {
        this.restClient = HttpClientFactory.forBaseUrl(appProperties.ollama().baseUrl());
    }

    /** Fetches all Ollama models. Throws on connection/HTTP errors (the caller decides how to tolerate). */
    public List<ProviderModel> getModels() {
        OllamaTagsResponse response = restClient.get()
                .uri("/api/tags")
                .retrieve()
                .body(OllamaTagsResponse.class);

        if (response == null || response.models() == null) {
            return List.of();
        }
        return response.models().stream()
                .map(OllamaClient::toProviderModel)
                .toList();
    }

    private static ProviderModel toProviderModel(OllamaTagsResponse.OllamaModel model) {
        OllamaTagsResponse.OllamaDetails details = model.details();
        String parameterSize = details != null ? details.parameterSize() : null;

        String version = (parameterSize != null && !parameterSize.isBlank())
                ? parameterSize
                : extractVersionFromName(model.name());

        return new ProviderModel(model.name(), ModelProvider.OLLAMA, "chat", version, true);
    }

    /** Derives a version from a {@code name:tag} identifier, e.g. {@code llama3.1:8b} -> {@code 8b}. */
    private static String extractVersionFromName(String name) {
        int idx = name.lastIndexOf(':');
        if (idx >= 0 && idx < name.length() - 1) {
            return name.substring(idx + 1);
        }
        return null;
    }
}
