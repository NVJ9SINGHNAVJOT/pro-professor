package com.proprofessor.server.diagram;

import com.proprofessor.server.common.db.DiagramFolderRow;
import com.proprofessor.server.common.db.DiagramRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.diagram.dto.DiagramFolderCreateRequest;
import com.proprofessor.server.diagram.dto.DiagramFolderSummary;
import com.proprofessor.server.diagram.mapper.DiagramMapper;
import com.proprofessor.server.diagram.repository.DiagramFolderRepository;
import com.proprofessor.server.diagram.repository.DiagramRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Folders for the diagram sidebar. A folder is addressed by id and never by name, so sibling names
 * may repeat — unlike diagram titles, which have to stay unique because `[[Title.diagram]]` resolves
 * by them.
 */
@Service
public class DiagramFolderService {

    private static final String DEFAULT_NAME = "New folder";
    private static final int MAX_NAME_LENGTH = 255;

    private final DiagramFolderRepository diagramFolderRepository;
    private final DiagramRepository diagramRepository;
    private final DiagramService diagramService;
    private final DiagramMapper diagramMapper;

    public DiagramFolderService(DiagramFolderRepository diagramFolderRepository,
                                DiagramRepository diagramRepository,
                                DiagramService diagramService,
                                DiagramMapper diagramMapper) {
        this.diagramFolderRepository = diagramFolderRepository;
        this.diagramRepository = diagramRepository;
        this.diagramService = diagramService;
        this.diagramMapper = diagramMapper;
    }

    public List<DiagramFolderSummary> listFolders() {
        return diagramFolderRepository.findAll().stream().map(diagramMapper::toFolderSummary).toList();
    }

    @Transactional
    public DiagramFolderSummary createFolder(DiagramFolderCreateRequest request) {
        diagramService.requireFolderExists(request.parentId());
        DiagramFolderRow folder = diagramFolderRepository.insert(normalizeName(request.name()), request.parentId());
        return diagramMapper.toFolderSummary(folder);
    }

    @Transactional
    public DiagramFolderSummary renameFolder(long id, String name) {
        requireFolder(id);
        diagramFolderRepository.rename(id, normalizeName(name));
        return diagramMapper.toFolderSummary(requireFolder(id));
    }

    /** Null {@code parentId} moves the folder to the root level. */
    @Transactional
    public DiagramFolderSummary moveFolder(long id, Long parentId) {
        requireFolder(id);
        diagramService.requireFolderExists(parentId);
        if (parentId != null && subtreeIds(id).contains(parentId)) {
            // Re-parenting a folder under itself or one of its own descendants would strand that
            // whole branch: nothing in it would be reachable from the root.
            throw new AppException(HttpStatus.BAD_REQUEST, "A folder cannot be moved inside itself.");
        }
        diagramFolderRepository.updateParent(id, parentId);
        return diagramMapper.toFolderSummary(requireFolder(id));
    }

    /**
     * All-or-nothing: if any diagram anywhere in the subtree is still linked from a note, nothing is
     * deleted. Otherwise the folder goes, and {@code ON DELETE CASCADE} takes the subfolders and
     * every diagram inside with it. Transactional so the check can't race the delete.
     */
    @Transactional
    public void deleteFolder(long id) {
        requireFolder(id);
        List<Long> diagramIds = diagramRepository.findByFolderIds(subtreeIds(id)).stream()
                .map(DiagramRow::id)
                .toList();
        diagramService.requireNoNoteReferences(diagramIds);
        diagramFolderRepository.deleteById(id);
    }

    /** The folder itself plus every folder beneath it, walked in memory from the flat list. */
    private Set<Long> subtreeIds(long rootId) {
        List<DiagramFolderRow> all = diagramFolderRepository.findAll();
        Set<Long> subtree = new HashSet<>();
        subtree.add(rootId);
        Deque<Long> pending = new ArrayDeque<>(List.of(rootId));
        while (!pending.isEmpty()) {
            Long current = pending.poll();
            for (DiagramFolderRow folder : all) {
                if (current.equals(folder.parentId()) && subtree.add(folder.id())) {
                    pending.add(folder.id());
                }
            }
        }
        return subtree;
    }

    private DiagramFolderRow requireFolder(long id) {
        return diagramFolderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Diagram folder not found: " + id));
    }

    private static String normalizeName(String name) {
        String resolved = name == null || name.isBlank() ? DEFAULT_NAME : name.trim();
        return resolved.length() > MAX_NAME_LENGTH ? resolved.substring(0, MAX_NAME_LENGTH) : resolved;
    }
}
