import { Request } from "express";
import { fetchApi } from "@/utils/fetchApi";
import { createAppError } from "@/utils/error";
import {
  AiServiceModel,
  AiServiceModelsResponse,
  OllamaModel,
  OllamaModelsResponse,
  ProviderModel,
} from "@/modules/models/types";

const OLLAMA_BASE_URL = `${process.env["OLLAMA_BASE_URL"] || "http://127.0.0.1:11434"}`.replace(/\/$/, "");
const AI_SERVICE_BASE_URL = `${process.env["AI_SERVICE_BASE_URL"] || "http://127.0.0.1:8000"}`.replace(/\/$/, "");

const getModelRole = (modelName: string, family?: string): ProviderModel["role"] => {
  const normalizedName = modelName.toLowerCase();
  const normalizedFamily = family?.toLowerCase() || "";

  if (normalizedName.includes("embedding") || normalizedFamily.includes("embed")) {
    return "embedding";
  }

  return "chat";
};

const mapOllamaModel = (model: OllamaModel): ProviderModel => {
  return {
    name: model.name,
    provider: "ollama",
    role: getModelRole(model.name, model.details.family),
    version: model.details.parameter_size || (model.name.includes(":") ? model.name.split(":").at(-1) || null : null),
    isActive: true,
  };
};

const mapAiServiceModel = (model: AiServiceModel): ProviderModel => {
  return {
    name: model.name,
    provider: "ai-service",
    role: getModelRole(model.name),
    version: null,
    isActive: model.loadable,
  };
};

const getOllamaModels = async (req: Request): Promise<ProviderModel[]> => {
  const result = await fetchApi<OllamaModelsResponse>(req, {
    method: "GET",
    url: `${OLLAMA_BASE_URL}/api/tags`,
  });

  if (result.error) {
    throw createAppError("EXTERNAL_SERVICE_ERROR", result.error.message || "Failed to fetch Ollama models.", {
      provider: "ollama",
      status: result.error.status,
      response: result.error.response,
    });
  }

  return result.response.models.map(mapOllamaModel);
};

const getAiServiceModels = async (req: Request): Promise<ProviderModel[]> => {
  const result = await fetchApi<AiServiceModelsResponse>(req, {
    method: "GET",
    url: `${AI_SERVICE_BASE_URL}/api/v1/models`,
  });

  if (result.error) {
    throw createAppError("EXTERNAL_SERVICE_ERROR", result.error.message || "Failed to fetch AI Service models.", {
      provider: "ai-service",
      status: result.error.status,
      response: result.error.response,
    });
  }

  return result.response.data.map(mapAiServiceModel).filter((model) => model.isActive);
};

export const modelsProviders = {
  getAiServiceModels,
  getOllamaModels,
};
