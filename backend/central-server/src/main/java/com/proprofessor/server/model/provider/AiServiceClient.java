package com.proprofessor.server.model.provider;

import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.dto.AiServiceModelsResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Objects;

/**
 * Talks to the Python AI service and maps its models into {@link ProviderModel}.
 * Only models the AI service reports as loadable are returned.
 */
@Component
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

    private final RestClient restClient;

    public AiServiceClient(AppProperties appProperties) {
        this.restClient = HttpClientFactory.forBaseUrl(appProperties.aiService().baseUrl());
    }

    /** Fetches loadable AI-service models. Throws on connection/HTTP errors (caller tolerates). */
    public List<ProviderModel> getModels() {
        AiServiceModelsResponse response = restClient.get()
                .uri("/api/v1/models")
                .retrieve()
                .body(AiServiceModelsResponse.class);

        if (response == null || response.data() == null) {
            return List.of();
        }
        return response.data().stream()
                .map(AiServiceClient::toProviderModel)
                .filter(Objects::nonNull)
                .filter(ProviderModel::isActive)
                .toList();
    }

    /** Asks the AI service to load a model into memory (it swaps out any other loaded model). */
    public void loadModel(String name) {
        restClient.post()
                .uri("/api/v1/models/load")
                .contentType(MediaType.APPLICATION_JSON)
                .body(new LoadModelBody(name))
                .retrieve()
                .toBodilessEntity();
    }

    private static ProviderModel toProviderModel(AiServiceModelsResponse.AiServiceModel model) {
        if (model.maxContextTokens() == null) {
            log.error("Excluding AI-service model '{}': no context window reported", model.name());
            return null;
        }
        List<String> modalities = model.inputModalities() != null ? model.inputModalities() : List.of("text");
        // The AI service does not yet advertise thinking capability; treat as unsupported for now.
        return new ProviderModel(model.name(), ModelProvider.AI_SERVICE, "chat", null, model.loadable(),
                modalities, model.maxContextTokens(), false);
    }

    /** Request body for the AI service load endpoint. */
    private record LoadModelBody(String name) {
    }
}
