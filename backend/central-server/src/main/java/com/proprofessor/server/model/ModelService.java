package com.proprofessor.server.model;

import com.proprofessor.server.common.db.ModelRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.AiServiceClient;
import com.proprofessor.server.model.provider.OllamaClient;
import com.proprofessor.server.model.repository.ModelRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;

@Service
public class ModelService {

    private static final Logger log = LoggerFactory.getLogger(ModelService.class);

    private static final Comparator<ProviderModel> BY_PROVIDER_THEN_NAME =
            Comparator.comparing((ProviderModel m) -> m.provider().getValue())
                    .thenComparing(ProviderModel::name);

    private final OllamaClient ollamaClient;
    private final AiServiceClient aiServiceClient;
    private final ModelRepository modelRepository;

    public ModelService(OllamaClient ollamaClient, AiServiceClient aiServiceClient, ModelRepository modelRepository) {
        this.ollamaClient = ollamaClient;
        this.aiServiceClient = aiServiceClient;
        this.modelRepository = modelRepository;
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

    public void loadModel(String name) {
        aiServiceClient.loadModel(name);
    }

    /**
     * Pre-warms an Ollama model so the following chat generation runs against a resident model,
     * returning this turn's load cost in seconds (real on a cold start, near-zero when warm) or
     * {@code null} on error. Used to report a clean {@code load_duration} for Ollama, whose
     * OpenAI-compatible chat endpoint omits timing data.
     */
    public Double preloadOllama(String name) {
        return ollamaClient.preload(name);
    }

    @Transactional
    public ModelRow getOrCreateModel(ModelProvider provider, String name) {
        return modelRepository.findByProviderAndName(provider.getValue(), name)
                .orElseGet(() -> modelRepository.insert(name, provider.getValue(), "chat", null, true));
    }

    private List<ProviderModel> fetchTolerant(Supplier<List<ProviderModel>> fetch, ModelProvider provider) {
        try {
            return fetch.get();
        } catch (Exception ex) {
            log.warn("Failed to fetch models from provider '{}': {}", provider.getValue(), ex.getMessage());
            return List.of();
        }
    }
}
