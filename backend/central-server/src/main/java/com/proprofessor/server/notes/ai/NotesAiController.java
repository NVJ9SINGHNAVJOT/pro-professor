package com.proprofessor.server.notes.ai;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteRevisionListResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A note's revision history.
 *
 * <p>There is no AI endpoint here any more: a note is edited by talking to the model in the notes
 * panel, which streams through {@code ChatController}'s {@code /chats/send} with the note attached
 * per turn. See {@link NotesAiService} for why nothing on the server writes a note from a reply.
 */
@RestController
@RequestMapping("/api/v1/notes")
public class NotesAiController {

    private final NotesAiService notesAiService;

    public NotesAiController(NotesAiService notesAiService) {
        this.notesAiService = notesAiService;
    }

    @GetMapping("/{id}/revisions")
    public ApiResponse<NoteRevisionListResponse> revisions(@PathVariable Long id) {
        return ApiResponse.ok(new NoteRevisionListResponse(notesAiService.listRevisions(id)));
    }

    @PostMapping("/{id}/revisions/{revisionId}/restore")
    public ApiResponse<NoteDetail> restore(@PathVariable Long id, @PathVariable Long revisionId) {
        return ApiResponse.ok("Revision restored.", notesAiService.restoreRevision(id, revisionId));
    }
}
