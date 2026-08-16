package com.proprofessor.server.model.provider;

import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.dto.AiCoreModelsResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Talks to the Python AI core and maps its models into {@link ProviderModel}.
 * Only models the AI core reports as loadable are returned.
 */
@Component
public class AiCoreClient {

    private static final Logger log = LoggerFactory.getLogger(AiCoreClient.class);

    private final RestClient restClient;

    public AiCoreClient(AppProperties appProperties) {
        this.restClient = HttpClientFactory.forBaseUrl(appProperties.aiCore().baseUrl());
    }

    /** Fetches loadable AI-core models. Throws on connection/HTTP errors (caller tolerates). */
    public List<ProviderModel> getModels() {
        AiCoreModelsResponse response = restClient.get()
                .uri("/api/v1/models")
                .retrieve()
                .body(AiCoreModelsResponse.class);

        if (response == null || response.data() == null) {
            return List.of();
        }
        return response.data().stream()
                .map(AiCoreClient::toProviderModel)
                .filter(Objects::nonNull)
                .filter(ProviderModel::isActive)
                .toList();
    }

    /** Asks the AI core to load a model into memory (it swaps out any other loaded model). */
    public void loadModel(String name) {
        // Loading weights takes seconds — log the intent so a slow or hung load is visible while it is
        // still happening, not only once it finishes.
        log.info("Loading AI-core model '{}'...", name);
        long start = System.currentTimeMillis();
        try {
            restClient.post()
                    .uri("/api/v1/models/load")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new LoadModelBody(name))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception ex) {
            // Names the model the boundary handler can't know about; the stack trace is logged once,
            // there, when this propagates.
            log.warn("Failed to load AI-core model '{}' after {}ms: {}",
                    name, System.currentTimeMillis() - start, ex.getMessage());
            throw ex;
        }
        log.info("Loaded AI-core model '{}' ({}ms)", name, System.currentTimeMillis() - start);
    }

    /**
     * Asks the AI core to unload whatever model it currently holds, freeing memory. Sent with an
     * empty body so it unloads the resident model regardless of name. Best-effort: a failure is logged
     * and swallowed so it never blocks the model switch that requested it.
     */
    public void unload() {
        log.info("Unloading AI-core model...");
        long start = System.currentTimeMillis();
        try {
            restClient.post()
                    .uri("/api/v1/models/unload")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of())
                    .retrieve()
                    .toBodilessEntity();
            log.info("Unloaded AI-core model ({}ms)", System.currentTimeMillis() - start);
        } catch (Exception ex) {
            log.warn("Failed to unload AI-core model: {}", ex.getMessage());
        }
    }

    private static ProviderModel toProviderModel(AiCoreModelsResponse.AiCoreModel model) {
        if (model.maxContextTokens() == null) {
            log.error("Excluding AI-core model '{}': no context window reported", model.name());
            return null;
        }
        List<String> modalities = model.inputModalities() != null ? model.inputModalities() : List.of("text");
        // The AI core does not yet advertise thinking capability; treat as unsupported for now.
        return new ProviderModel(model.name(), ModelProvider.AI_CORE, "chat", null, model.loadable(),
                modalities, model.maxContextTokens(), false);
    }

    /** Request body for the AI core load endpoint. */
    private record LoadModelBody(String name) {
    }
}
