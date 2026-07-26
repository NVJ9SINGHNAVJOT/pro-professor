package com.proprofessor.server.diagram.dto;

import java.util.List;

/**
 * The whole sidebar in one response. Folders are a flat list — the client builds the tree from
 * {@code parentId} — so opening the section stays a single request.
 */
public record DiagramListResponse(List<DiagramFolderSummary> folders, List<DiagramSummary> diagrams) {
}
