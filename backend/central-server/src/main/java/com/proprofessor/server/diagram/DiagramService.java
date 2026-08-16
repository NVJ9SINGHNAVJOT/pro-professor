package com.proprofessor.server.diagram;

import com.fasterxml.jackson.databind.JsonNode;
import com.proprofessor.server.common.db.DiagramRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.diagram.dto.DiagramCreateRequest;
import com.proprofessor.server.diagram.dto.DiagramDetail;
import com.proprofessor.server.diagram.dto.DiagramSummary;
import com.proprofessor.server.diagram.dto.DiagramUpdateRequest;
import com.proprofessor.server.diagram.mapper.DiagramMapper;
import com.proprofessor.server.diagram.repository.DiagramFolderRepository;
import com.proprofessor.server.diagram.repository.DiagramRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

/**
 * CRUD for diagrams. The content is an Excalidraw scene JSON document; the
 * server only requires it to be a JSON object (no server-side schema).
 * Titles are unique — `[[Title.diagram]]` links resolve by them.
 */
@Service
public class DiagramService {

    private static final String DEFAULT_TITLE = "Untitled Diagram";
    private static final int MAX_TITLE_LENGTH = 255;
    /** How many diagram→note pairs a "still linked" message spells out before summarizing. */
    private static final int MAX_LISTED_REFERENCES = 3;

    private final DiagramRepository diagramRepository;
    private final DiagramFolderRepository diagramFolderRepository;
    private final DiagramMapper diagramMapper;

    public DiagramService(DiagramRepository diagramRepository,
                          DiagramFolderRepository diagramFolderRepository,
                          DiagramMapper diagramMapper) {
        this.diagramRepository = diagramRepository;
        this.diagramFolderRepository = diagramFolderRepository;
        this.diagramMapper = diagramMapper;
    }

    public List<DiagramSummary> listDiagrams() {
        return diagramRepository.findAll().stream().map(diagramMapper::toSummary).toList();
    }

    public DiagramDetail getDiagram(long id) {
        return diagramMapper.toDetail(requireDiagram(id));
    }

    public DiagramDetail getDiagramByTitle(String title) {
        DiagramRow diagram = diagramRepository.findByTitle(title)
                .orElseThrow(() -> new ResourceNotFoundException("Diagram not found: " + title));
        return diagramMapper.toDetail(diagram);
    }

    @Transactional
    public DiagramDetail createDiagram(DiagramCreateRequest request) {
        String title = uniqueTitle(normalizeTitle(request.title()), null);
        requireFolderExists(request.folderId());
        DiagramRow diagram = diagramRepository.insert(title, requireContent(request.content()), request.folderId());
        return diagramMapper.toDetail(diagram);
    }

    @Transactional
    public DiagramDetail updateDiagram(long id, DiagramUpdateRequest request) {
        DiagramRow existing = requireDiagram(id);
        String title = request.title() == null || request.title().isBlank()
                ? existing.title()
                : uniqueTitle(normalizeTitle(request.title()), id);
        diagramRepository.update(id, title, requireContent(request.content()));
        return getDiagram(id);
    }

    /**
     * Renames a diagram and nothing else — same reasoning as {@link #moveDiagram}: this must not
     * round-trip the whole scene, and the editor's title field is not part of its autosave.
     */
    @Transactional
    public DiagramDetail renameDiagram(long id, String title) {
        requireDiagram(id);
        if (title == null || title.isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Diagram title must not be blank.");
        }
        diagramRepository.updateTitle(id, uniqueTitle(normalizeTitle(title), id));
        return getDiagram(id);
    }

    /**
     * Moves a diagram between folders — deliberately not part of {@link #updateDiagram}, which is
     * the editor's autosave path. Null {@code folderId} moves it to the root level.
     */
    @Transactional
    public DiagramDetail moveDiagram(long id, Long folderId) {
        requireDiagram(id);
        requireFolderExists(folderId);
        diagramRepository.updateFolder(id, folderId);
        return getDiagram(id);
    }

    @Transactional
    public void deleteDiagram(long id) {
        requireDiagram(id);
        requireNoNoteReferences(List.of(id));
        diagramRepository.deleteById(id);
    }

    /**
     * Refuses to delete diagrams that notes still link to with {@code [[Title.diagram]]}.
     *
     * <p>Links resolve by title at click time, so deleting the target would silently turn a working
     * link into a dead one with nothing to point the user at. Shared with
     * {@link DiagramFolderService}, which checks a folder's whole subtree in one call so a folder
     * delete is all-or-nothing.
     */
    void requireNoNoteReferences(Collection<Long> diagramIds) {
        List<DiagramRepository.NoteReference> references = diagramRepository.findNoteReferences(diagramIds);
        if (references.isEmpty()) return;

        String listed = references.stream()
                .limit(MAX_LISTED_REFERENCES)
                .map(ref -> "\"%s\" is linked from note \"%s\"".formatted(ref.diagramTitle(), ref.noteTitle()))
                .collect(Collectors.joining("; "));
        int remaining = references.size() - Math.min(references.size(), MAX_LISTED_REFERENCES);
        String suffix = remaining > 0 ? " (+%d more)".formatted(remaining) : "";
        throw new AppException(HttpStatus.CONFLICT,
                "Cannot delete: %s%s. Remove the links first.".formatted(listed, suffix));
    }

    /** A null folder is the root level, which always exists. */
    void requireFolderExists(Long folderId) {
        if (folderId == null) return;
        diagramFolderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Diagram folder not found: " + folderId));
    }

    private DiagramRow requireDiagram(long id) {
        return diagramRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Diagram not found: " + id));
    }

    private String requireContent(JsonNode content) {
        if (content == null || !content.isObject()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Diagram content must be a JSON object.");
        }
        return content.toString();
    }

    private static String normalizeTitle(String title) {
        String resolved = title == null || title.isBlank() ? DEFAULT_TITLE : title.trim();
        return resolved.length() > MAX_TITLE_LENGTH ? resolved.substring(0, MAX_TITLE_LENGTH) : resolved;
    }

    /** Same rule as notes: a taken title gets a numeric suffix ("X" → "X 2" → "X 3" …). */
    private String uniqueTitle(String title, Long selfId) {
        String candidate = title;
        for (int suffix = 2; isTaken(candidate, selfId); suffix++) {
            candidate = title + " " + suffix;
        }
        return candidate;
    }

    private boolean isTaken(String title, Long selfId) {
        return diagramRepository.findByTitle(title)
                .filter(existing -> selfId == null || existing.id() != selfId)
                .isPresent();
    }
}
