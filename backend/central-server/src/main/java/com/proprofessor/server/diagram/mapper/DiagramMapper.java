package com.proprofessor.server.diagram.mapper;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.common.db.DiagramRow;
import com.proprofessor.server.diagram.dto.DiagramDetail;
import com.proprofessor.server.diagram.dto.DiagramSummary;
import org.springframework.stereotype.Component;

@Component
public class DiagramMapper {

    private final ObjectMapper objectMapper;

    public DiagramMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public DiagramSummary toSummary(DiagramRow diagram) {
        return new DiagramSummary(diagram.id(), diagram.title(), diagram.updatedAt());
    }

    public DiagramDetail toDetail(DiagramRow diagram) {
        return new DiagramDetail(
                diagram.id(),
                diagram.title(),
                parseContent(diagram.contentJson()),
                diagram.createdAt(),
                diagram.updatedAt()
        );
    }

    private JsonNode parseContent(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException ex) {
            // the column is jsonb and written from a JsonNode, so this can't happen in practice
            return objectMapper.createObjectNode();
        }
    }
}
