package com.proprofessor.server.settings;

import com.proprofessor.server.chat.InferenceOptions;
import com.proprofessor.server.common.db.AppSettingsRow;
import com.proprofessor.server.common.db.InferenceDefaults;
import com.proprofessor.server.settings.dto.SettingsResponse;
import com.proprofessor.server.settings.dto.SettingsUpdateRequest;
import com.proprofessor.server.settings.repository.SettingsRepository;
import org.springframework.stereotype.Service;

/**
 * Global default inference params. The Notes AI actions read their defaults here (chat carries its
 * own per-conversation settings and does not use this). The settings page reads and writes these via
 * {@link com.proprofessor.server.settings.SettingsController}.
 */
@Service
public class SettingsService {

    private final SettingsRepository settingsRepository;

    public SettingsService(SettingsRepository settingsRepository) {
        this.settingsRepository = settingsRepository;
    }

    public SettingsResponse get() {
        AppSettingsRow row = settingsRepository.find();
        return new SettingsResponse(row.notes());
    }

    public SettingsResponse update(SettingsUpdateRequest request) {
        settingsRepository.update(request.notes());
        return get();
    }

    /** Defaults applied to Notes AI actions (rewrite/summarize/continue). */
    public InferenceOptions notesInferenceOptions() {
        return toOptions(settingsRepository.find().notes());
    }

    private static InferenceOptions toOptions(InferenceDefaults d) {
        return new InferenceOptions(d.maxTokens(), d.temperature(), d.topP(), d.repetitionPenalty(), false, false);
    }
}
