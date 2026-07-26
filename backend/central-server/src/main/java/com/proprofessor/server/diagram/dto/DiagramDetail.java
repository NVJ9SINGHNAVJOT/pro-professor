package com.proprofessor.server.diagram.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;

public record DiagramDetail(
        long id,
        String title,
        JsonNode content,
        Long folderId,
        Instant createdAt,
        Instant updatedAt
) {
}
