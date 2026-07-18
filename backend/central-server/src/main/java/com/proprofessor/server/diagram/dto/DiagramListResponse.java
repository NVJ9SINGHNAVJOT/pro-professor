package com.proprofessor.server.diagram.dto;

import java.util.List;

public record DiagramListResponse(List<DiagramSummary> diagrams) {
}
