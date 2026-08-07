package com.proprofessor.server.settings;

import com.proprofessor.server.chat.InferenceOptions;
import com.proprofessor.server.common.db.AppSettingsRow;
import com.proprofessor.server.common.db.InferenceDefaults;
import com.proprofessor.server.settings.dto.SettingsResponse;
import com.proprofessor.server.settings.dto.SettingsUpdateRequest;
import com.proprofessor.server.settings.repository.SettingsRepository;
import org.springframework.stereotype.Service;

/**
 * Global default inference params, backing both notes AI surfaces: the note update action, and a
 * chat turn that omits its params — which is how the note chat panel sends every turn, so one set
 * of sliders governs both. The chat screen sends concrete per-conversation params and never reads
 * these. The settings page reads and writes them via
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

    /** Defaults applied to the AI note update and to note chat turns. */
    public InferenceOptions notesInferenceOptions() {
        return toOptions(settingsRepository.find().notes());
    }

    private static InferenceOptions toOptions(InferenceDefaults d) {
        return new InferenceOptions(d.maxTokens(), d.temperature(), d.topP(), d.repetitionPenalty(), false, false);
    }
}
