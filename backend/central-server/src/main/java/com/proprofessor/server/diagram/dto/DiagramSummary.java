package com.proprofessor.server.diagram.dto;

import java.time.Instant;

/** {@code folderId} is null at the root level. */
public record DiagramSummary(long id, String title, Long folderId, Instant updatedAt) {
}
