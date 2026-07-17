package com.proprofessor.server.notes.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.common.db.NoteRow;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteSummary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class NoteMapper {

    private final ObjectMapper objectMapper;

    public NoteMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public NoteSummary toSummary(NoteRow note, List<String> tags) {
        return new NoteSummary(note.id(), note.title(), tags, note.updatedAt());
    }

    public NoteDetail toDetail(NoteRow note, List<String> tags) {
        return new NoteDetail(
                note.id(),
                note.title(),
                note.content(),
                parseFrontmatter(note.frontmatterJson()),
                tags,
                note.createdAt(),
                note.updatedAt()
        );
    }

    private Map<String, Object> parseFrontmatter(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (JsonProcessingException ex) {
            // the column is written from a parsed map, so this can't happen in practice
            return Map.of();
        }
    }
}
