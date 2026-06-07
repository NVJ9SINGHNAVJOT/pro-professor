package com.proprofessor.server.health.dto;

import java.time.Instant;

/**
 * Lightweight liveness payload for {@code GET /health}.
 *
 * <p>This is a simple "is the app up" check for the frontend / load balancers.
 * Detailed dependency status (db, redis, kafka) lives at {@code /actuator/health}.
 *
 * @param status    fixed {@code "UP"} when the app is serving
 * @param service   service name, to distinguish this server in logs/dashboards
 * @param timestamp server time the response was produced
 */
public record HealthResponse(
        String status,
        String service,
        Instant timestamp
) {
}
