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
import com.proprofessor.server.diagram.repository.DiagramRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * CRUD for diagrams. The DiagramBundle document is validated client-side (ajv
 * is the single gate); the server only requires content to be a JSON object.
 * Titles are unique — `![[name.diagram]]` embeds resolve by them.
 */
@Service
public class DiagramService {

    private static final String DEFAULT_TITLE = "Untitled Diagram";
    private static final int MAX_TITLE_LENGTH = 255;

    private final DiagramRepository diagramRepository;
    private final DiagramMapper diagramMapper;

    public DiagramService(DiagramRepository diagramRepository, DiagramMapper diagramMapper) {
        this.diagramRepository = diagramRepository;
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
        DiagramRow diagram = diagramRepository.insert(title, requireContent(request.content()));
        return diagramMapper.toDetail(diagram);
    }

    @Transactional
    public DiagramDetail updateDiagram(long id, DiagramUpdateRequest request) {
        DiagramRow existing = requireDiagram(id);
        String title = request.title() == null || request.title().isBlank()
                ? existing.title()
                : uniqueTitle(normalizeTitle(request.title()), id);
        if (Boolean.TRUE.equals(request.snapshot())) {
            diagramRepository.insertRevision(id, existing.contentJson());
        }
        diagramRepository.update(id, title, requireContent(request.content()));
        return getDiagram(id);
    }

    @Transactional
    public void deleteDiagram(long id) {
        requireDiagram(id);
        diagramRepository.deleteById(id);
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
