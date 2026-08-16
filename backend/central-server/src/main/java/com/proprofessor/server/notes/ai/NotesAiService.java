package com.proprofessor.server.notes.ai;

import com.proprofessor.server.common.db.NoteRevisionRow;
import com.proprofessor.server.common.db.NoteRow;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.notes.NotesService;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteRevisionSummary;
import com.proprofessor.server.notes.dto.NoteUpdateRequest;
import com.proprofessor.server.notes.repository.NotesRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * A note's revision history — the backstop behind every AI edit.
 *
 * <p>The AI itself no longer lives here. A note is edited by talking to the model in the notes
 * panel, which runs through the ordinary chat stream ({@code ChatService}, with the note attached
 * per turn as {@code noteContext}); the model proposes edits as delimited blocks, the frontend
 * shows each as a diff, and an accepted one is applied into the editor as an ordinary undoable
 * edit. <strong>Nothing on the server writes a note as a result of a model reply.</strong>
 *
 * <p>Which is why no snapshot is taken on that path: the review step is the safety net, and the
 * user still has to save. {@link #restoreRevision} does write one, so a restore stays undoable.
 */
@Service
public class NotesAiService {

    private final NotesRepository notesRepository;
    private final NotesService notesService;

    public NotesAiService(NotesRepository notesRepository, NotesService notesService) {
        this.notesRepository = notesRepository;
        this.notesService = notesService;
    }

    public List<NoteRevisionSummary> listRevisions(long noteId) {
        requireNote(noteId);
        return notesRepository.findRevisionsByNoteId(noteId).stream()
                .map(revision -> new NoteRevisionSummary(revision.id(), revision.createdAt()))
                .toList();
    }

    /** Restores a snapshot — the current content is itself snapshotted first, so a restore is undoable. */
    public NoteDetail restoreRevision(long noteId, long revisionId) {
        NoteRow note = requireNote(noteId);
        NoteRevisionRow revision = notesRepository.findRevisionById(noteId, revisionId)
                .orElseThrow(() -> new ResourceNotFoundException("Revision not found: " + revisionId));
        notesRepository.insertRevision(noteId, note.content());
        return notesService.updateNote(noteId, new NoteUpdateRequest(null, revision.content()));
    }

    private NoteRow requireNote(long noteId) {
        return notesRepository.findById(noteId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found: " + noteId));
    }
}
