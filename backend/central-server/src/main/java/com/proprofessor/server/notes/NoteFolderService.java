package com.proprofessor.server.notes;

import com.proprofessor.server.common.db.NoteFolderRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.notes.dto.NoteFolderCreateRequest;
import com.proprofessor.server.notes.dto.NoteFolderSummary;
import com.proprofessor.server.notes.mapper.NoteMapper;
import com.proprofessor.server.notes.repository.NoteFolderRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Folders for the note explorer. A folder is addressed by id and never by name, so sibling names
 * may repeat — unlike note titles, which stay globally unique because {@code [[wiki links]]} resolve
 * by them. Moving a note between folders therefore never changes how it is linked.
 *
 * <p>Deleting a folder has no reference guard, unlike the diagram one: a note that links to a
 * deleted note simply has an unresolved link, which is already what {@code DELETE /notes/{id}} does.
 */
@Service
public class NoteFolderService {

    private static final String DEFAULT_NAME = "New folder";
    private static final int MAX_NAME_LENGTH = 255;

    private final NoteFolderRepository noteFolderRepository;
    private final NoteMapper noteMapper;

    public NoteFolderService(NoteFolderRepository noteFolderRepository, NoteMapper noteMapper) {
        this.noteFolderRepository = noteFolderRepository;
        this.noteMapper = noteMapper;
    }

    public List<NoteFolderSummary> listFolders() {
        return noteFolderRepository.findAll().stream().map(noteMapper::toFolderSummary).toList();
    }

    @Transactional
    public NoteFolderSummary createFolder(NoteFolderCreateRequest request) {
        requireFolderExists(request.parentId());
        NoteFolderRow folder = noteFolderRepository.insert(normalizeName(request.name()), request.parentId());
        return noteMapper.toFolderSummary(folder);
    }

    @Transactional
    public NoteFolderSummary renameFolder(long id, String name) {
        requireFolder(id);
        noteFolderRepository.rename(id, normalizeName(name));
        return noteMapper.toFolderSummary(requireFolder(id));
    }

    /** Null {@code parentId} moves the folder to the root level. */
    @Transactional
    public NoteFolderSummary moveFolder(long id, Long parentId) {
        requireFolder(id);
        requireFolderExists(parentId);
        if (parentId != null && subtreeIds(id).contains(parentId)) {
            // Re-parenting a folder under itself or one of its own descendants would strand that
            // whole branch: nothing in it would be reachable from the root.
            throw new AppException(HttpStatus.BAD_REQUEST, "A folder cannot be moved inside itself.");
        }
        noteFolderRepository.updateParent(id, parentId);
        return noteMapper.toFolderSummary(requireFolder(id));
    }

    /** {@code ON DELETE CASCADE} takes the subfolders and every note inside them with it. */
    @Transactional
    public void deleteFolder(long id) {
        requireFolder(id);
        noteFolderRepository.deleteById(id);
    }

    /** No-op for null (the root level); 404 for a folder that isn't there. */
    public void requireFolderExists(Long folderId) {
        if (folderId != null) {
            requireFolder(folderId);
        }
    }

    /** The folder itself plus every folder beneath it, walked in memory from the flat list. */
    private Set<Long> subtreeIds(long rootId) {
        List<NoteFolderRow> all = noteFolderRepository.findAll();
        Set<Long> subtree = new HashSet<>();
        subtree.add(rootId);
        Deque<Long> pending = new ArrayDeque<>(List.of(rootId));
        while (!pending.isEmpty()) {
            Long current = pending.poll();
            for (NoteFolderRow folder : all) {
                if (current.equals(folder.parentId()) && subtree.add(folder.id())) {
                    pending.add(folder.id());
                }
            }
        }
        return subtree;
    }

    private NoteFolderRow requireFolder(long id) {
        return noteFolderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Note folder not found: " + id));
    }

    private static String normalizeName(String name) {
        String resolved = name == null || name.isBlank() ? DEFAULT_NAME : name.trim();
        return resolved.length() > MAX_NAME_LENGTH ? resolved.substring(0, MAX_NAME_LENGTH) : resolved;
    }
}
