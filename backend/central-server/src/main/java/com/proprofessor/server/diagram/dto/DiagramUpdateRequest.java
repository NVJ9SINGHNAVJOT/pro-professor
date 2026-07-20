package com.proprofessor.server.diagram.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** {@code title} is optional — null keeps the current one. {@code content} is the Excalidraw scene. */
public record DiagramUpdateRequest(String title, JsonNode content) {
}
