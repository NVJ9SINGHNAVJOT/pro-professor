package com.proprofessor.server.diagram.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * {@code title} is optional — null keeps the current one. {@code snapshot} true
 * snapshots the current content into {@code diagram_revisions} before the
 * overwrite (the save that follows an AI edit sets it, so AI edits stay reversible).
 */
public record DiagramUpdateRequest(String title, JsonNode content, Boolean snapshot) {
}
