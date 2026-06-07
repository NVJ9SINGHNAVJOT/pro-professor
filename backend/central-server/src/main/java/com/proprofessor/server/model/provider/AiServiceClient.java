package com.proprofessor.server.model.provider;

import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.dto.AiServiceModelsResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Talks to the Python AI service and maps its models into {@link ProviderModel}.
 *
 * <p>Spring equivalent of the AI-service half of the Node {@code models.providers.ts}.
 * Only models the AI service reports as loadable are returned (mirrors the Node
 * {@code .filter((model) => model.isActive)}).
 */
@Component
public class AiServiceClient {

    private final RestClient restClient;

    public AiServiceClient(AppProperties appProperties) {
        String baseUrl = stripTrailingSlash(appProperties.aiService().baseUrl());
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
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
                .filter(ProviderModel::isActive)
                .toList();
    }

    private static ProviderModel toProviderModel(AiServiceModelsResponse.AiServiceModel model) {
        return new ProviderModel(
                model.name(),
                ModelProvider.AI_SERVICE,
                ModelClassifier.resolveRole(model.name(), null),
                null,
                model.loadable()
        );
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
