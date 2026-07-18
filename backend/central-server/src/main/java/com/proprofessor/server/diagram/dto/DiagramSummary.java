package com.proprofessor.server.diagram.dto;

import java.time.Instant;

public record DiagramSummary(long id, String title, Instant updatedAt) {
}
