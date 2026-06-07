package com.proprofessor.server.health;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.health.dto.HealthResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/**
 * Simple liveness endpoint.
 *
 * <p>Thin by design: it builds a {@link HealthResponse} and returns it in the
 * standard {@link ApiResponse} envelope — no business logic, no dependency checks
 * (those belong to {@code /actuator/health}).
 */
@RestController
public class HealthController {

    private final String serviceName;

    public HealthController(@Value("${spring.application.name}") String serviceName) {
        this.serviceName = serviceName;
    }

    @GetMapping("/health")
    public ApiResponse<HealthResponse> health() {
        return ApiResponse.ok(new HealthResponse("UP", serviceName, Instant.now()));
    }
}
