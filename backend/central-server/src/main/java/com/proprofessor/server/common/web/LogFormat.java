package com.proprofessor.server.common.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Shared formatting for the request/response log envelopes.
 *
 * <p>Mirrors the AI core's logging convention (see {@code app/api/middleware.py}) so a single user
 * action reads the same way in both services' logs: a message line followed by an indented JSON body.
 *
 * <p>Uses the Spring-managed {@link ObjectMapper} so logged bodies serialize exactly as they do on the
 * wire (records, {@code @JsonInclude}, date formats).
 */
@Component
public class LogFormat {

    /**
     * Request headers worth logging. Deliberately a whitelist, not a blocklist — it is what keeps
     * credentials out of the logs. Same five the AI core logs.
     */
    static final List<String> LOGGED_HEADERS = List.of(
            "content-type", "origin", "sec-fetch-site", "sec-fetch-mode", "sec-ch-ua-platform");

    private final ObjectWriter writer;

    public LogFormat(ObjectMapper objectMapper) {
        this.writer = objectMapper.writerWithDefaultPrettyPrinter();
    }

    /** Renders a value as indented JSON. Never throws — logging must not be able to fail a request. */
    public String dumps(Object value) {
        try {
            return writer.writeValueAsString(value);
        } catch (Exception ex) {
            return String.valueOf(value);
        }
    }
}
