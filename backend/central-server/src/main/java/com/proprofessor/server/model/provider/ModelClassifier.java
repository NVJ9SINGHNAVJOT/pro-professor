package com.proprofessor.server.model.provider;

/**
 * Small shared helper for classifying a model's role from its name/family.
 * Both provider clients use this, so it lives in one place.
 */
final class ModelClassifier {

    private ModelClassifier() {
    }

    /**
     * Mirrors the Node {@code getModelRole}: a model is treated as an embedding
     * model if its name or family hints at embeddings, otherwise it is a chat model.
     *
     * @param name   model name (required)
     * @param family model family, may be {@code null}
     * @return {@code "embedding"} or {@code "chat"}
     */
    static String resolveRole(String name, String family) {
        String normalizedName = name.toLowerCase();
        String normalizedFamily = family == null ? "" : family.toLowerCase();

        if (normalizedName.contains("embedding") || normalizedFamily.contains("embed")) {
            return "embedding";
        }
        return "chat";
    }
}
