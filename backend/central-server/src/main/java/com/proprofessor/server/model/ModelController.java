package com.proprofessor.server.model;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.model.dto.ModelListResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for models. Thin: it delegates to {@link ModelService} and
 * wraps the result in the standard {@link ApiResponse} envelope.
 *
 * <p>Equivalent of the Node {@code models.route.ts} + {@code models.controller.ts}
 * (the route is expressed here as annotations).
 */
@RestController
@RequestMapping("/api/v1/models")
public class ModelController {

    private final ModelService modelService;

    public ModelController(ModelService modelService) {
        this.modelService = modelService;
    }

    @GetMapping("/all")
    public ApiResponse<ModelListResponse> getAllModels() {
        ModelListResponse data = new ModelListResponse(modelService.getAllModels());
        return ApiResponse.ok("Models fetched successfully.", data);
    }
}
