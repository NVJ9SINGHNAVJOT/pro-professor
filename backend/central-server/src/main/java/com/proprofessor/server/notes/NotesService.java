package com.proprofessor.server.notes;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.common.db.NoteRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.notes.dto.NoteCreateRequest;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteLinkDto;
import com.proprofessor.server.notes.dto.NoteSummary;
import com.proprofessor.server.notes.dto.NoteUpdateRequest;
import com.proprofessor.server.notes.mapper.NoteMapper;
import com.proprofessor.server.notes.repository.NotesRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CRUD for Markdown notes. On every save the content's YAML frontmatter is parsed
 * (title/tags/anything else) into the {@code frontmatter} jsonb column and the
 * note's tag links are rebuilt.
 */
@Service
public class NotesService {

    private static final Pattern FIRST_HEADING = Pattern.compile("^#{1,6}\\s+(.+)$", Pattern.MULTILINE);
    private static final String DEFAULT_TITLE = "Untitled";
    private static final int MAX_TITLE_LENGTH = 255;

    private final NotesRepository notesRepository;
    private final NoteMapper noteMapper;
    private final ObjectMapper objectMapper;

    public NotesService(NotesRepository notesRepository, NoteMapper noteMapper, ObjectMapper objectMapper) {
        this.notesRepository = notesRepository;
        this.noteMapper = noteMapper;
        this.objectMapper = objectMapper;
    }

    /** All notes, or only those carrying {@code tag} when it is given. */
    public List<NoteSummary> listNotes(String tag) {
        List<NoteRow> notes = (tag == null || tag.isBlank())
                ? notesRepository.findAll()
                : notesRepository.findAllByTag(tag.trim());
        return toSummaries(notes);
    }

    /** Keyword search (Postgres FTS over title + content), best match first. */
    public List<NoteSummary> searchNotes(String query) {
        if (query == null || query.isBlank()) return List.of();
        return toSummaries(notesRepository.search(query.trim()));
    }

    /** Every note's outgoing links — the edge list for the graph view. */
    public List<NoteLinkDto> listLinks() {
        return notesRepository.findAllLinks().entrySet().stream()
                .flatMap(entry -> entry.getValue().stream()
                        .map(link -> new NoteLinkDto(entry.getKey(), link.targetRef(), link.type())))
                .toList();
    }

    /** Notes that link to this note (by its title). */
    public List<NoteSummary> getBacklinks(long id) {
        NoteRow note = requireNote(id);
        return toSummaries(notesRepository.findBacklinks(note.title()));
    }

    private List<NoteSummary> toSummaries(List<NoteRow> notes) {
        Map<Long, List<String>> tagsByNote =
                notesRepository.findTagsByNoteIds(notes.stream().map(NoteRow::id).toList());
        return notes.stream()
                .map(note -> noteMapper.toSummary(note, tagsByNote.getOrDefault(note.id(), List.of())))
                .toList();
    }

    public NoteDetail getNote(long id) {
        NoteRow note = requireNote(id);
        return noteMapper.toDetail(note, notesRepository.findTagsByNoteId(id));
    }

    @Transactional
    public NoteDetail createNote(NoteCreateRequest request) {
        String content = request.content() == null ? "" : request.content();
        Frontmatter frontmatter = Frontmatter.parse(content);
        String title = uniqueTitle(resolveTitle(frontmatter, request.title(), content), null);
        NoteRow note = notesRepository.insert(title, content, toJson(frontmatter.map()));
        indexRefs(note.id(), frontmatter);
        return getNote(note.id());
    }

    @Transactional
    public NoteDetail updateNote(long id, NoteUpdateRequest request) {
        requireNote(id);
        String content = request.content() == null ? "" : request.content();
        Frontmatter frontmatter = Frontmatter.parse(content);
        String title = uniqueTitle(resolveTitle(frontmatter, request.title(), content), id);
        notesRepository.update(id, title, content, toJson(frontmatter.map()));
        indexRefs(id, frontmatter);
        return getNote(id);
    }

    /** Rebuilds the note's tag links (frontmatter + inline #tags) and outgoing wiki-links/embeds. */
    private void indexRefs(long noteId, Frontmatter frontmatter) {
        LinkParser.ParsedRefs refs = LinkParser.parse(frontmatter.body());
        List<String> tags = new ArrayList<>(frontmatter.tags());
        refs.tags().stream().filter(tag -> !tags.contains(tag)).forEach(tags::add);
        notesRepository.replaceTags(noteId, tags);
        notesRepository.replaceLinks(noteId, refs.links());
    }

    @Transactional
    public void deleteNote(long id) {
        requireNote(id);
        notesRepository.deleteById(id);
    }

    private NoteRow requireNote(long id) {
        return notesRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found: " + id));
    }

    /** Title precedence: frontmatter {@code title} → request title → "Untitled". */
    private static String resolveTitle(Frontmatter frontmatter, String requestTitle, String content) {
        String title = frontmatter.title();
        if (title == null && requestTitle != null && !requestTitle.isBlank()) title = requestTitle.trim();
        if (title == null || title.isBlank()) title = DEFAULT_TITLE;
        return title.length() > MAX_TITLE_LENGTH ? title.substring(0, MAX_TITLE_LENGTH) : title;
    }

    /**
     * Titles identify notes (wiki-links resolve by them), so they are unique. A taken
     * title gets a numeric suffix: "Untitled" → "Untitled 2" → "Untitled 3" …
     */
    private String uniqueTitle(String title, Long selfId) {
        String candidate = title;
        for (int suffix = 2; isTaken(candidate, selfId); suffix++) {
            candidate = title + " " + suffix;
        }
        return candidate;
    }

    private boolean isTaken(String title, Long selfId) {
        return notesRepository.findByTitle(title)
                .filter(existing -> selfId == null || existing.id() != selfId)
                .isPresent();
    }

    private String toJson(Map<String, Object> frontmatter) {
        try {
            return objectMapper.writeValueAsString(frontmatter);
        } catch (JsonProcessingException ex) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Frontmatter has values that can't be stored");
        }
    }
}
