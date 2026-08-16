package com.proprofessor.server.diagram.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * {@code content} is the full Excalidraw scene JSON document.
 *
 * <p>{@code folderId} files the diagram on creation — null is the root level. Present so a diagram
 * created inside a folder lands there, rather than being born at the root and moved by a second
 * request a round trip later.
 */
public record DiagramCreateRequest(String title, JsonNode content, Long folderId) {
}
