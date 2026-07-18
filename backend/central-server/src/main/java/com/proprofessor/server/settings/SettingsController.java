package com.proprofessor.server.settings;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.settings.dto.SettingsResponse;
import com.proprofessor.server.settings.dto.SettingsUpdateRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for the global default inference params (Notes + Diagrams). Thin — delegates to
 * {@link SettingsService} and wraps results in {@link ApiResponse}.
 */
@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public ApiResponse<SettingsResponse> get() {
        return ApiResponse.ok(settingsService.get());
    }

    @PutMapping
    public ApiResponse<SettingsResponse> update(@RequestBody SettingsUpdateRequest request) {
        return ApiResponse.ok("Settings saved.", settingsService.update(request));
    }
}
