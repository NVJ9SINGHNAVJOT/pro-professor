package com.proprofessor.server.diagram.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** {@code content} is the full DiagramBundle JSON document. */
public record DiagramCreateRequest(String title, JsonNode content) {
}
