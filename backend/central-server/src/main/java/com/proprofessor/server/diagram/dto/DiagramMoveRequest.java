package com.proprofessor.server.diagram.dto;

/**
 * Moves a diagram between folders. Null {@code folderId} moves it to the root level.
 *
 * <p>Deliberately separate from {@link DiagramUpdateRequest}: that one is the editor's ~800ms
 * autosave, which sends only title + content. Carrying {@code folderId} there would make every
 * autosave deserialize an absent field to null and drag the diagram back to the root.
 */
public record DiagramMoveRequest(Long folderId) {
}
