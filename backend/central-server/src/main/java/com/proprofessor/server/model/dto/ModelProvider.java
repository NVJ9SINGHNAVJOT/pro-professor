package com.proprofessor.server.model.dto;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The source a model comes from. Serialized to the lowercase wire value
 * (e.g. {@code "ollama"}) to match the frontend contract.
 */
public enum ModelProvider {
    OLLAMA("ollama"),
    AI_SERVICE("ai-service");

    private final String value;

    ModelProvider(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }
}
