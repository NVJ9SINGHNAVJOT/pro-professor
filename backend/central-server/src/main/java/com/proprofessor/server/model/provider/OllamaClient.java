package com.proprofessor.server.model.provider;

import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.dto.OllamaShowResponse;
import com.proprofessor.server.model.provider.dto.OllamaTagsResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Talks to the local Ollama service and maps its models into {@link ProviderModel}.
 * Owns the external call and the mapping; does not persist or know about the web layer.
 */
@Component
public class OllamaClient {

    private static final Logger log = LoggerFactory.getLogger(OllamaClient.class);

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
                .map(m -> toProviderModel(m, fetchShow(m.name())))
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * Calls {@code POST /api/show} for a single model to retrieve its capabilities
     * and {@code model_info} (used for the context window). Returns {@code null} on
     * any error so one bad model doesn't block the entire list.
     */
    private OllamaShowResponse fetchShow(String modelName) {
        try {
            return restClient.post()
                    .uri("/api/show")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("model", modelName))
                    .retrieve()
                    .body(OllamaShowResponse.class);
        } catch (Exception e) {
            log.warn("Failed to fetch /api/show for Ollama model '{}': {}", modelName, e.getMessage());
            return null;
        }
    }

    /**
     * Reads the model's context window from {@code model_info}. The relevant key is
     * {@code <arch>.context_length} where {@code <arch>} comes from
     * {@code general.architecture}; other keys can also end in {@code context_length}
     * (e.g. {@code <arch>.rope.scaling.original_context_length}), so we resolve the
     * architecture explicitly instead of matching by suffix.
     */
    private static Integer extractContextLength(Map<String, Object> modelInfo) {
        if (modelInfo == null) {
            return null;
        }
        Object arch = modelInfo.get("general.architecture");
        if (!(arch instanceof String archName) || archName.isBlank()) {
            return null;
        }
        Object value = modelInfo.get(archName + ".context_length");
        return value instanceof Number number ? number.intValue() : null;
    }

    /**
     * Maps Ollama capability strings to our normalised input modality names.
     * <ul>
     *   <li>{@code "completion"} → {@code "text"} (always added as default)</li>
     *   <li>{@code "vision"} → {@code "image"}</li>
     * </ul>
     * Capabilities like {@code "tools"} and {@code "thinking"} are not input modalities and are ignored.
     */
    private static List<String> mapCapabilitiesToModalities(List<String> capabilities) {
        List<String> modalities = new ArrayList<>();
        modalities.add("text"); // every Ollama model accepts text input
        for (String cap : capabilities) {
            if ("vision".equals(cap) && !modalities.contains("image")) {
                modalities.add("image");
            }
        }
        return List.copyOf(modalities);
    }

    private static ProviderModel toProviderModel(OllamaTagsResponse.OllamaModel model, OllamaShowResponse show) {
        Integer maxContextTokens = extractContextLength(show != null ? show.modelInfo() : null);
        if (maxContextTokens == null) {
            log.error("Excluding Ollama model '{}': no context window in /api/show model_info", model.name());
            return null;
        }

        OllamaTagsResponse.OllamaDetails details = model.details();
        String parameterSize = details != null ? details.parameterSize() : null;

        String version = (parameterSize != null && !parameterSize.isBlank())
                ? parameterSize
                : extractVersionFromName(model.name());

        List<String> capabilities = show != null && show.capabilities() != null ? show.capabilities() : List.of();
        List<String> modalities = mapCapabilitiesToModalities(capabilities);
        boolean supportsThinking = capabilities.contains("thinking");
        return new ProviderModel(model.name(), ModelProvider.OLLAMA, "chat", version, true,
                modalities, maxContextTokens, supportsThinking);
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

