package com.proprofessor.server.model;

import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.AiServiceClient;
import com.proprofessor.server.model.provider.OllamaClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;

/**
 * Aggregates models from every provider into one normalized, sorted list.
 *
 * <p>Mirrors the Node {@code models.service.ts}: each provider is queried
 * independently, a single provider failure is tolerated (its models are just
 * skipped), and only if <em>all</em> providers fail does the request error out.
 * Results are sorted by provider, then by name.
 */
@Service
public class ModelService {

    private static final Logger log = LoggerFactory.getLogger(ModelService.class);

    private static final Comparator<ProviderModel> BY_PROVIDER_THEN_NAME =
            Comparator.comparing((ProviderModel m) -> m.provider().getValue())
                    .thenComparing(ProviderModel::name);

    private final OllamaClient ollamaClient;
    private final AiServiceClient aiServiceClient;

    public ModelService(OllamaClient ollamaClient, AiServiceClient aiServiceClient) {
        this.ollamaClient = ollamaClient;
        this.aiServiceClient = aiServiceClient;
    }

    public List<ProviderModel> getAllModels() {
        List<ProviderModel> models = new ArrayList<>();
        models.addAll(fetchTolerant(ollamaClient::getModels, ModelProvider.OLLAMA));
        models.addAll(fetchTolerant(aiServiceClient::getModels, ModelProvider.AI_SERVICE));

        if (models.isEmpty()) {
            throw new AppException(HttpStatus.BAD_GATEWAY,
                    "Unable to fetch models from Ollama and AI Service.");
        }

        models.sort(BY_PROVIDER_THEN_NAME);
        return models;
    }

    /** Runs a provider fetch, returning an empty list (and logging) instead of failing the whole request. */
    private List<ProviderModel> fetchTolerant(Supplier<List<ProviderModel>> fetch, ModelProvider provider) {
        try {
            return fetch.get();
        } catch (Exception ex) {
            log.warn("Failed to fetch models from provider '{}': {}", provider.getValue(), ex.getMessage());
            return List.of();
        }
    }
}
